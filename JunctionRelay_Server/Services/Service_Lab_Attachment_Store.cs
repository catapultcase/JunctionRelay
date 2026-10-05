/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * JunctionRelay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * JunctionRelay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with JunctionRelay. If not, see <https://www.gnu.org/licenses/>.
 */

using System.Security.Cryptography;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    // Lab module (HOMELAB) — the one place attachment bytes are written to disk.
    //
    // Extracted from Controller_Lab_Attachments so the MCP tool surface stores files the
    // same way the web UI does: same content-dedupe, same guid naming, same row shape. Two
    // implementations of "save an invoice" would drift, and the one that drifted would be
    // the one the assistant used.
    public sealed class Service_Lab_Attachment_Store
    {
        public const long MaxFileSizeBytes = 25 * 1024 * 1024;

        private readonly Service_Database_Manager_Lab_Attachments _attachmentsDb;
        private readonly string _storageDir;

        public Service_Lab_Attachment_Store(
            Service_Database_Manager_Lab_Attachments attachmentsDb,
            DataDirectoryProvider dataDirectoryProvider)
        {
            _attachmentsDb = attachmentsDb;
            _storageDir = Path.Combine(dataDirectoryProvider.DataDirectory, "lab", "attachments");
        }

        // Writes the bytes if this content is new, links them if it is not, and returns the
        // attachment row. Callers validate size/target first — see EnsureStorable.
        public async Task<Model_Lab_Attachment> StoreAsync(
            byte[] bytes, string fileName, string? contentType,
            int? componentId, int? machineId, string? kind, string? notes)
        {
            Directory.CreateDirectory(_storageDir);

            // Hash first: identical content shares one stored file, rows are the links
            var sha256 = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

            var existing = await _attachmentsDb.GetByHashAsync(sha256);
            string storedName;
            if (existing != null && File.Exists(Path.Combine(_storageDir, existing.StoredName)))
            {
                storedName = existing.StoredName;
            }
            else
            {
                var extension = Path.GetExtension(fileName);
                if (extension.Length > 10) extension = string.Empty;   // defensive: absurd "extensions"
                storedName = $"{Guid.NewGuid():N}{extension}";
                await File.WriteAllBytesAsync(Path.Combine(_storageDir, storedName), bytes);
            }

            var attachment = new Model_Lab_Attachment
            {
                ComponentId = componentId,
                MachineId = machineId,
                Kind = string.IsNullOrWhiteSpace(kind) ? "Invoice" : kind,
                FileName = Path.GetFileName(fileName),
                StoredName = storedName,
                ContentType = contentType,
                SizeBytes = bytes.LongLength,
                Sha256 = sha256,
                Notes = notes,
            };
            attachment.Id = await _attachmentsDb.CreateAttachmentAsync(attachment);
            return attachment;
        }

        // ⛔ A path the SERVER may read, or nothing. Reading arbitrary paths on request is
        // how a filing tool becomes a file-disclosure tool, so reads are confined to the
        // directories in LAB_ATTACHMENT_ROOTS (colon or comma separated). Unset means the
        // feature is off and callers are told to upload instead.
        public static string? PathRefusal(string path)
        {
            var roots = (Environment.GetEnvironmentVariable("LAB_ATTACHMENT_ROOTS") ?? "")
                .Split(new[] { ':', ',' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList();

            if (roots.Count == 0)
                return "This server reads no local paths - LAB_ATTACHMENT_ROOTS is not set.";

            string full;
            try { full = Path.GetFullPath(path); }
            catch (Exception ex) { return $"'{path}' is not a usable path ({ex.Message})."; }

            // GetFullPath resolves ../ first, so a traversal cannot escape a root.
            foreach (var root in roots)
            {
                var r = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                if (full.StartsWith(r, StringComparison.Ordinal)) return null;
            }

            return $"'{full}' is outside LAB_ATTACHMENT_ROOTS ({string.Join(", ", roots)}).";
        }

        // The out-of-band upload, as a command that works from ANY machine. It deliberately
        // names no wrapper script: one that exists on a single host is a dead instruction
        // everywhere else.
        //
        // ⛔ THE TOKEN IS NOT OPTIONAL. A bare POST to /api/lab/attachments is authenticated, so
        // it returns 401 and a remote agent has no working path. The ticket carries the
        // authorisation the caller already proved over MCP, so the command needs no credentials
        // of its own.
        //
        // The page a person opens to see the row. Goes in every reply that creates or changes a
        // component so the agent can hand the user a link instead of an id.
        public static string ComponentLink(int id)
        {
            var api = Environment.GetEnvironmentVariable("LAB_PUBLIC_URL")?.TrimEnd('/')
                      ?? "http://<this-server>:7180";
            return $"{api}/homelab/component/{id}";
        }

        public static string UploadHint(string token)
        {
            var api = Environment.GetEnvironmentVariable("LAB_PUBLIC_URL")?.TrimEnd('/')
                      ?? "http://<this-server>:7180";
            return $"curl -F file=@<path-to-invoice> {api}/api/lab/attachments/t/{token}";
        }

        // Rejects a file that is structurally incomplete. Returns null when it looks intact.
        //
        // ⛔ THIS EXISTS BECAUSE A CORRUPT RECEIPT IS WORSE THAN A MISSING ONE. Measured
        // an assistant filed a Beelink EQ12 through lab_add_from_invoice with
        // extracted data that was entirely correct, and an "invoice" of 281 bytes - a valid
        // %PDF-1.4 header and one metadata object, then garbage. A local model asked to emit
        // ~90 KB of base64 produces a plausible opening and drifts. The row read as complete
        // in the UI (attachmentCount: 1) and the paperwork was unopenable, which is the one
        // failure the invoice feature must not have.
        //
        // Cheapest reliable tell for a PDF is the trailer: every valid one ends with %%EOF.
        //
        // ⛔ AND THE NAME IS A CLAIM, NOT A FACT. Measured: an agent saved email
        // bodies as text and uploaded them as invoices. This check only looked at files that
        // CLAIMED to be PDFs, so plain text sailed through, and every one rendered blank in
        // the viewer while the row read as "1 file". So an invoice is now judged by its
        // bytes: it is a PDF, PNG or JPEG, or it is refused.
        public static string? ValidateIntegrity(byte[] bytes, string fileName, string? kind = null)
        {
            var sniffed = Sniff(bytes);

            if (fileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) && sniffed != "pdf")
                return "that is not a PDF - it does not start with %PDF-.";

            var isInvoice = string.IsNullOrWhiteSpace(kind)
                            || kind.Equals("invoice", StringComparison.OrdinalIgnoreCase);
            if (isInvoice && !IsDocumentKind(sniffed))
                return $"that is {(sniffed == "text" ? "a plain-text file" : "not a document")} " +
                       $"({bytes.Length:N0} bytes), not a PDF or an image. An invoice attachment has " +
                       "to be the actual receipt - PDF, PNG or JPEG. ⛔ Do NOT save an email body " +
                       "as text and upload it under an invoice name: it renders blank in the viewer " +
                       "and the row looks filed when it is not. If the order only exists as an " +
                       "email, say so and leave the row without paperwork.";

            if (sniffed != "pdf") return null;   // images have no cheap truncation tell

            // %%EOF lives in the last bytes of a well-formed file; scan a generous tail.
            var tailLength = Math.Min(bytes.Length, 2048);
            var tail = System.Text.Encoding.ASCII.GetString(bytes, bytes.Length - tailLength, tailLength);
            if (!tail.Contains("%%EOF"))
                return $"that PDF is TRUNCATED - {bytes.Length:N0} bytes with no %%EOF trailer, " +
                       "so it cannot be opened. The file was cut off in transit, not by you. " +
                       "⛔ Do NOT retry by re-sending the bytes - the same thing will happen. " +
                       "Ask the user to attach it through the web UI, or use a wrapper script that " +
                       "reads the file and posts it directly.";

            return null;
        }

        // What the bytes actually are, whatever name they arrived under.
        public static string Sniff(byte[] bytes)
        {
            if (bytes.Length >= 5 && bytes[0] == (byte)'%' && bytes[1] == (byte)'P' &&
                bytes[2] == (byte)'D' && bytes[3] == (byte)'F' && bytes[4] == (byte)'-') return "pdf";
            if (bytes.Length >= 4 && bytes[0] == 0x89 && bytes[1] == (byte)'P' &&
                bytes[2] == (byte)'N' && bytes[3] == (byte)'G') return "png";
            if (bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF) return "jpeg";

            var probe = Math.Min(bytes.Length, 512);
            var textish = 0;
            for (var i = 0; i < probe; i++)
            {
                var b = bytes[i];
                if (b == 9 || b == 10 || b == 13 || (b >= 32 && b < 127) || b >= 128) textish++;
            }
            return probe > 0 && textish == probe ? "text" : "binary";
        }

        public static bool IsDocumentKind(string sniffed) => sniffed is "pdf" or "png" or "jpeg";

        public string PathFor(Model_Lab_Attachment attachment) =>
            Path.Combine(_storageDir, attachment.StoredName);

        public async Task<byte[]?> ReadAsync(Model_Lab_Attachment attachment)
        {
            var path = PathFor(attachment);
            return File.Exists(path) ? await File.ReadAllBytesAsync(path) : null;
        }

        // Shared storage: the physical file goes only when the last row pointing at it does.
        // Best effort on the file - an orphaned blob is preferable to a failed delete.
        public async Task<bool> DeleteAsync(Model_Lab_Attachment attachment)
        {
            var deleted = await _attachmentsDb.DeleteAttachmentAsync(attachment.Id);
            if (!deleted) return false;
            var remaining = await _attachmentsDb.CountByStoredNameAsync(attachment.StoredName);
            if (remaining == 0)
            {
                try { File.Delete(PathFor(attachment)); } catch { }
            }
            return true;
        }

        // The read-side twin of UploadHint: a single-use ticket, no credentials, any host.
        public static string DownloadHint(string token, string fileName)
        {
            var api = Environment.GetEnvironmentVariable("LAB_PUBLIC_URL")?.TrimEnd('/')
                      ?? "http://<this-server>:7180";
            var safe = fileName.Replace("'", "");
            return $"curl -o '{safe}' {api}/api/lab/attachments/d/{token}";
        }

        // Shared validation. Returns null when the request is storable, otherwise the reason.
        public static string? EnsureStorable(long length, int? componentId, int? machineId)
        {
            if (length <= 0)
                return "A non-empty file is required.";
            if (length > MaxFileSizeBytes)
                return $"File exceeds the {MaxFileSizeBytes / (1024 * 1024)} MB limit.";
            if (!componentId.HasValue && !machineId.HasValue)
                return "componentId or machineId is required.";
            return null;
        }
    }
}
