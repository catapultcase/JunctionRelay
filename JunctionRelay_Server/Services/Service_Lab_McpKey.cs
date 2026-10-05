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

using JunctionRelayServer.Interfaces;

namespace JunctionRelayServer.Services
{
    // Lab module (HOMELAB) — storage and lifecycle for the MCP endpoint's bearer key.
    //
    // Mirrors the Collectors access-token pattern: the key is always encrypted at rest, and
    // password protection is opt-in. With a password the server genuinely cannot use the key
    // until someone unlocks it — the password is never stored, only the ability to decrypt
    // is cached, and that cache dies with the process.
    //
    // Singleton: the unlocked key lives in memory for the process lifetime, exactly like
    // Collectors' _decryptedTokenCache.
    //
    // Settings is the only source for the key. There is deliberately no configuration or
    // environment override: a second source means the UI can show one thing while the
    // endpoint honours another, and an injected key bypasses the encryption and the
    // password lock entirely.
    public class Service_Lab_McpKey
    {
        public const string SettingKey = "Lab.McpApiKey";
        public const string SettingProtection = "Lab.McpApiKeyProtection";

        public const string ProtectionDataProtection = "dataprotection";
        public const string ProtectionPassword = "password";

        private readonly IService_Settings _settings;
        private readonly ISecretsService _secrets;

        // Plaintext key, in memory only. Never persisted, never returned to a caller.
        private string? _unlockedKey;
        private readonly object _gate = new();

        public Service_Lab_McpKey(
            IService_Settings settings,
            ISecretsService secrets)
        {
            _settings = settings;
            _secrets = secrets;
        }

        public class McpKeyStatus
        {
            // "database" | "none"
            public string Source { get; set; } = "none";
            public bool Configured { get; set; }
            // "dataprotection" | "password" | null
            public string? Protection { get; set; }
            // Password-protected and not yet unlocked in this process.
            public bool Locked { get; set; }
        }

        public async Task<McpKeyStatus> GetStatusAsync()
        {
            var stored = await _settings.GetSettingAsync(SettingKey);
            if (string.IsNullOrWhiteSpace(stored))
                return new McpKeyStatus();

            var protection = await _settings.GetSettingAsync(SettingProtection) ?? ProtectionDataProtection;

            bool locked;
            lock (_gate) locked = protection == ProtectionPassword && _unlockedKey == null;

            return new McpKeyStatus
            {
                Source = "database",
                Configured = true,
                Protection = protection,
                Locked = locked
            };
        }

        // The key the MCP middleware compares against, or null when there is none or it is
        // locked. Callers must treat null as "the endpoint does not exist".
        public async Task<string?> ResolveKeyAsync()
        {
            lock (_gate)
            {
                if (_unlockedKey != null) return _unlockedKey;
            }

            var stored = await _settings.GetSettingAsync(SettingKey);
            if (string.IsNullOrWhiteSpace(stored)) return null;

            var protection = await _settings.GetSettingAsync(SettingProtection) ?? ProtectionDataProtection;

            // Password-protected keys stay locked until someone supplies the password.
            if (protection == ProtectionPassword) return null;

            try
            {
                var plain = _secrets.DecryptSecret(stored);
                lock (_gate) _unlockedKey = plain;
                return plain;
            }
            catch (Exception)
            {
                // Data Protection keys are per-install: a restored database from another
                // machine cannot be decrypted here. Treat as absent rather than throwing on
                // every request.
                return null;
            }
        }

        // Minimum strength for a key that is the ONLY thing standing in front of the
        // whole Lab tool surface, on a server that is often internet-facing (security
        // audit M6). Without it any non-empty string - "test" - would be a valid
        // key. 24 characters of real entropy is what GenerateKey() below
        // produces; a user-supplied key has to clear the same bar.
        public const int MinKeyLength = 24;

        // A key the operator can generate rather than invent. Same shape as the cloud's.
        public static string GenerateKey() =>
            "jrmcp_" + Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32))
                .Replace('+', '-').Replace('/', '_').TrimEnd('=');

        public async Task SetKeyAsync(string key, string? password)
        {
            if (string.IsNullOrWhiteSpace(key))
                throw new ArgumentException("Key must not be empty.", nameof(key));

            if (key.Length < MinKeyLength)
                throw new ArgumentException(
                    $"Key must be at least {MinKeyLength} characters. Use the Generate button rather than " +
                    "inventing one — this key is the only thing protecting the MCP endpoint.", nameof(key));

            // Rejects "aaaaaaaa..." and other long-but-trivial strings that clear a length
            // check while carrying almost no entropy.
            if (key.Distinct().Count() < 8)
                throw new ArgumentException(
                    "Key is too repetitive to be safe. Use the Generate button.", nameof(key));

            var usePassword = !string.IsNullOrWhiteSpace(password);

            var encrypted = usePassword
                ? _secrets.EncryptWithPassword(key, password!)
                : _secrets.EncryptSecret(key);

            await _settings.SetSettingAsync(SettingKey, encrypted, "Lab MCP endpoint bearer key (encrypted)");
            await _settings.SetSettingAsync(SettingProtection,
                usePassword ? ProtectionPassword : ProtectionDataProtection,
                "How the Lab MCP key is protected at rest");

            lock (_gate)
            {
                // A password-protected key is deliberately left locked on the next restart,
                // but stays usable for the rest of this process so setting it does not
                // immediately break a live assistant.
                _unlockedKey = key;
            }
        }

        public async Task<bool> UnlockAsync(string password)
        {
            var stored = await _settings.GetSettingAsync(SettingKey);
            if (string.IsNullOrWhiteSpace(stored)) return false;

            var protection = await _settings.GetSettingAsync(SettingProtection) ?? ProtectionDataProtection;
            if (protection != ProtectionPassword) return false;

            try
            {
                var plain = _secrets.DecryptWithPassword(stored, password);
                lock (_gate) _unlockedKey = plain;
                return true;
            }
            catch (Exception)
            {
                // Wrong password. Say nothing more than "no".
                return false;
            }
        }

        public void Lock()
        {
            lock (_gate) _unlockedKey = null;
        }

        public async Task ClearAsync()
        {
            await _settings.SetSettingAsync(SettingKey, string.Empty, "Lab MCP endpoint bearer key (encrypted)");
            await _settings.SetSettingAsync(SettingProtection, string.Empty, "How the Lab MCP key is protected at rest");
            Lock();
        }
    }
}
