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

using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace JunctionRelayServer.Services
{
    // ⛔ WHY THIS EXISTS. An agent that is not running ON the server had no way to attach a
    // file. Measured: filePath only reads inside LAB_ATTACHMENT_ROOTS, which is a
    // directory on the server - an agent on another host cannot put bytes there. The fallback
    // UploadHint emitted a curl with no credentials against an authenticated endpoint, so it
    // returned 401. And the bytes must never come through the model, because a chat model
    // asked to emit 90 KB of base64 produces a plausible header and drifts.
    //
    // 🔑 So the MCP call itself becomes the authorisation. Getting this far already required
    // an authenticated MCP request; that trust is handed to a single-use, short-lived,
    // opaque token which any machine can POST a file to with no credentials of its own.
    // Nothing secret passes through the model, and no long-lived key leaves the gateway.
    public sealed class Service_Lab_Attachment_Tickets
    {
        // Short enough that a leaked token is worthless quickly, long enough that an agent
        // can read the reply, find the file and run the command without racing a timer.
        public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(15);

        public sealed record Ticket(
            string Token,
            IReadOnlyList<int> ComponentIds,
            int? MachineId,
            string? Kind,
            string? Notes,
            DateTime ExpiresUtc);

        // 🔑 Same trust, opposite direction: lab_read_attachment mints one of these so an
        // agent on another host can pull the actual bytes without a credential and without
        // the file passing through the model. Names exactly one attachment.
        public sealed record DownloadTicket(string Token, int AttachmentId, DateTime ExpiresUtc);

        private readonly ConcurrentDictionary<string, Ticket> _tickets = new(StringComparer.Ordinal);
        private readonly ConcurrentDictionary<string, DownloadTicket> _downloads = new(StringComparer.Ordinal);

        // 256 bits from a CSPRNG, url-safe. Not guessable and not enumerable.
        private static string NewToken() =>
            Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
                   .Replace('+', '-').Replace('/', '_').TrimEnd('=');

        public Ticket Mint(IReadOnlyList<int> componentIds, int? machineId, string? kind, string? notes)
        {
            Prune();
            var ticket = new Ticket(NewToken(), componentIds, machineId, kind, notes,
                                    DateTime.UtcNow.Add(Lifetime));
            _tickets[ticket.Token] = ticket;
            return ticket;
        }

        public DownloadTicket MintDownload(int attachmentId)
        {
            Prune();
            var ticket = new DownloadTicket(NewToken(), attachmentId, DateTime.UtcNow.Add(Lifetime));
            _downloads[ticket.Token] = ticket;
            return ticket;
        }

        public DownloadTicket? RedeemDownload(string token)
        {
            Prune();
            if (string.IsNullOrWhiteSpace(token)) return null;
            if (!_downloads.TryRemove(token, out var ticket)) return null;
            return ticket.ExpiresUtc > DateTime.UtcNow ? ticket : null;
        }

        // ⛔ SINGLE USE. Removing on redemption is what stops a token captured from a log or a
        // shell history being replayed. An expired or already-used token is indistinguishable
        // from one that never existed, which is the point.
        public Ticket? Redeem(string token)
        {
            Prune();
            if (string.IsNullOrWhiteSpace(token)) return null;
            if (!_tickets.TryRemove(token, out var ticket)) return null;
            return ticket.ExpiresUtc > DateTime.UtcNow ? ticket : null;
        }

        private void Prune()
        {
            var now = DateTime.UtcNow;
            foreach (var kv in _tickets)
                if (kv.Value.ExpiresUtc <= now)
                    _tickets.TryRemove(kv.Key, out _);
            foreach (var kv in _downloads)
                if (kv.Value.ExpiresUtc <= now)
                    _downloads.TryRemove(kv.Key, out _);
        }
    }
}
