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

using JunctionRelayServer.Models;
using JunctionRelayServer.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/lab/attachments")]
    public class Controller_Lab_Attachments : ControllerBase
    {
        private const long MaxFileSizeBytes = Service_Lab_Attachment_Store.MaxFileSizeBytes;

        private readonly Service_Database_Manager_Lab_Attachments _attachmentsDb;
        private readonly Service_Lab_Attachment_Store _store;
        private readonly Service_Lab_Attachment_Tickets _tickets;
        private readonly string _storageDir;

        public Controller_Lab_Attachments(
            Service_Database_Manager_Lab_Attachments attachmentsDb,
            Service_Lab_Attachment_Store store,
            Service_Lab_Attachment_Tickets tickets,
            DataDirectoryProvider dataDirectoryProvider)
        {
            _attachmentsDb = attachmentsDb;
            _store = store;
            _tickets = tickets;
            _storageDir = Path.Combine(dataDirectoryProvider.DataDirectory, "lab", "attachments");
        }

        // ⛔ THE ONLY ANONYMOUS ROUTE HERE, AND IT IS NOT A HOLE. The caller proved itself by
        // making an authenticated MCP call to mint this ticket; the token carries that trust
        // for one upload. It is 256 random bits, single-use, expires in 15 minutes, and names
        // the exact rows the file may attach to - so a captured token cannot read anything,
        // cannot pick its own target, and cannot be replayed.
        //
        // 🔑 This is what lets an agent running on a DIFFERENT machine attach a file at all.
        // Before it, filePath needed the file on the server and the emitted curl had no
        // credentials, so a remote agent had no working path - see Service_Lab_Attachment_Tickets.
        [AllowAnonymous]
        [HttpPost("t/{token}")]
        [RequestSizeLimit(MaxFileSizeBytes + 1024 * 1024)]
        public async Task<IActionResult> UploadWithTicket(string token, [FromForm] IFormFile file)
        {
            var ticket = _tickets.Redeem(token);
            if (ticket == null)
                return NotFound("That upload ticket is unknown, already used, or expired. " +
                                "Nothing was written - run lab_add_from_invoice again for a new one.");

            if (file == null || file.Length == 0)
                return BadRequest("No file was sent. Nothing was written - the ticket is now spent, " +
                                  "so run lab_add_from_invoice again for a new one.");

            var firstTarget = ticket.ComponentIds.Count > 0 ? (int?)ticket.ComponentIds[0] : null;
            var problem = Service_Lab_Attachment_Store.EnsureStorable(file.Length, firstTarget, ticket.MachineId);
            if (problem != null) return BadRequest(problem);

            try
            {
                byte[] bytes;
                await using (var ms = new MemoryStream())
                {
                    await file.CopyToAsync(ms);
                    bytes = ms.ToArray();
                }

                // ⛔ Same integrity gate as the authenticated route. A corrupt receipt is worse
                // than a missing one, and a ticket must not become a way around that check.
                var integrity = Service_Lab_Attachment_Store.ValidateIntegrity(bytes, file.FileName, ticket.Kind);
                if (integrity != null) return BadRequest($"Nothing was written - {integrity}");

                var made = new List<Model_Lab_Attachment>();
                if (ticket.ComponentIds.Count == 0)
                {
                    made.Add(await _store.StoreAsync(bytes, file.FileName, file.ContentType,
                                                     null, ticket.MachineId, ticket.Kind, ticket.Notes));
                }
                else
                {
                    foreach (var id in ticket.ComponentIds)
                        made.Add(await _store.StoreAsync(bytes, file.FileName, file.ContentType,
                                                         id, null, ticket.Kind, ticket.Notes));
                }

                return Ok(new
                {
                    attached = made.Count,
                    componentIds = ticket.ComponentIds,
                    fileName = file.FileName,
                    links = ticket.ComponentIds.Select(Service_Lab_Attachment_Store.ComponentLink).ToArray(),
                    message = $"Attached {file.FileName} to {made.Count} row(s). Report the link(s) above " +
                              "and say WHICH document this was - the vendor's PDF or a render of the email."
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_ATTACHMENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error uploading attachment: {ex.Message}");
            }
        }

        [HttpGet]
        public async Task<IActionResult> GetAttachments([FromQuery] int? componentId, [FromQuery] int? machineId)
        {
            try
            {
                if (!componentId.HasValue && !machineId.HasValue)
                    return BadRequest("componentId or machineId is required.");
                return Ok(await _attachmentsDb.GetAttachmentsAsync(componentId, machineId));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_ATTACHMENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching attachments: {ex.Message}");
            }
        }

        // ⚠️ Accepts componentIds (comma-separated) as well as a single componentId. One
        // invoice usually covers several rows, and posting the file once per row re-uploaded
        // the same bytes N times - 17 times for a single order in practice.
        [HttpPost]
        [RequestSizeLimit(MaxFileSizeBytes + 1024 * 1024)]
        public async Task<IActionResult> UploadAttachment(
            [FromForm] IFormFile file, [FromForm] int? componentId, [FromForm] int? machineId,
            [FromForm] string? componentIds, [FromForm] string? kind, [FromForm] string? notes)
        {
            var targets = new List<int>();
            if (componentId.HasValue) targets.Add(componentId.Value);
            if (!string.IsNullOrWhiteSpace(componentIds))
                foreach (var part in componentIds.Split(',', StringSplitOptions.RemoveEmptyEntries |
                                                            StringSplitOptions.TrimEntries))
                    if (int.TryParse(part, out var id) && !targets.Contains(id)) targets.Add(id);

            if (targets.Count == 0 && machineId == null)
                return BadRequest("Give componentId, componentIds or machineId - nothing was written.");

            var problem = Service_Lab_Attachment_Store.EnsureStorable(
                file?.Length ?? 0, targets.Count > 0 ? targets[0] : null, machineId);
            if (problem != null) return BadRequest(problem);

            try
            {
                byte[] bytes;
                await using (var ms = new MemoryStream())
                {
                    await file!.CopyToAsync(ms);
                    bytes = ms.ToArray();
                }

                var integrity = Service_Lab_Attachment_Store.ValidateIntegrity(bytes, file.FileName, kind);
                if (integrity != null) return BadRequest($"Nothing was written - {integrity}");

                // StoreAsync dedupes on content hash, so the bytes land once and each call
                // adds a link row.
                var made = new List<Model_Lab_Attachment>();
                if (targets.Count == 0)
                {
                    made.Add(await _store.StoreAsync(bytes, file.FileName, file.ContentType,
                                                     null, machineId, kind, notes));
                }
                else
                {
                    foreach (var id in targets)
                        made.Add(await _store.StoreAsync(bytes, file.FileName, file.ContentType,
                                                         id, null, kind, notes));
                }

                return CreatedAtAction(nameof(GetAttachments),
                                       new { componentId = targets.FirstOrDefault(), machineId },
                                       made.Count == 1 ? (object)made[0] : made);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_ATTACHMENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error uploading attachment: {ex.Message}");
            }
        }

        // 🔑 The read-side twin of the upload ticket, for the same reason: an agent on another
        // host has no credential for /download, and the bytes must not come back through the
        // model. Minted by lab_read_attachment; single use, 15 minutes, one attachment.
        [AllowAnonymous]
        [HttpGet("d/{token}")]
        public async Task<IActionResult> DownloadWithTicket(string token)
        {
            try
            {
                var ticket = _tickets.RedeemDownload(token);
                if (ticket == null)
                    return NotFound("That download ticket is unknown, already used, or expired. " +
                                    "Run lab_read_attachment again for a new one.");

                var attachment = await _attachmentsDb.GetAttachmentByIdAsync(ticket.AttachmentId);
                if (attachment == null) return NotFound($"Attachment {ticket.AttachmentId} not found.");

                var path = _store.PathFor(attachment);
                if (!System.IO.File.Exists(path)) return NotFound("Stored file is missing on disk.");
                return PhysicalFile(path, attachment.ContentType ?? "application/octet-stream", attachment.FileName);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_ATTACHMENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error downloading attachment: {ex.Message}");
            }
        }

        [HttpGet("{id}/download")]
        public async Task<IActionResult> DownloadAttachment(int id, [FromQuery] bool inline = false)
        {
            try
            {
                var attachment = await _attachmentsDb.GetAttachmentByIdAsync(id);
                if (attachment == null) return NotFound($"Attachment {id} not found.");

                var path = Path.Combine(_storageDir, attachment.StoredName);
                if (!System.IO.File.Exists(path)) return NotFound("Stored file is missing on disk.");

                // inline=true omits the download filename so the Content-Disposition stays
                // inline and the browser renders the file (PDF viewer) instead of saving it.
                if (inline)
                    return PhysicalFile(path, attachment.ContentType ?? "application/octet-stream");

                return PhysicalFile(path, attachment.ContentType ?? "application/octet-stream", attachment.FileName);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_ATTACHMENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error downloading attachment: {ex.Message}");
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteAttachment(int id)
        {
            try
            {
                var attachment = await _attachmentsDb.GetAttachmentByIdAsync(id);
                if (attachment == null) return NotFound($"Attachment {id} not found.");

                await _store.DeleteAsync(attachment);
                return NoContent();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_ATTACHMENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error deleting attachment: {ex.Message}");
            }
        }
    }
}
