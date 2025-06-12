/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

using JunctionRelayServer.Interfaces;
using Microsoft.AspNetCore.DataProtection;
using System;
using System.Threading.Tasks;

namespace JunctionRelayServer.Services
{
    public class SecretsService : ISecretsService
    {
        private readonly IDataProtector _protector;
        private readonly string _encryptedPrefix = "ENC_";

        public SecretsService(IDataProtectionProvider dataProtectionProvider)
        {
            _protector = dataProtectionProvider.CreateProtector("JunctionRelay.Secrets");
        }

        public string EncryptSecret(string plainText)
        {
            if (string.IsNullOrEmpty(plainText)) return plainText;

            // If already encrypted, return as-is
            if (IsEncrypted(plainText)) return plainText;

            try
            {
                var encrypted = _protector.Protect(plainText);
                return _encryptedPrefix + encrypted;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Warning: Failed to encrypt secret: {ex.Message}");
                return plainText; // Fallback to plaintext if encryption fails
            }
        }

        public string DecryptSecret(string encryptedText)
        {
            if (string.IsNullOrEmpty(encryptedText)) return encryptedText;

            // If not encrypted, return as-is (backward compatibility)
            if (!IsEncrypted(encryptedText)) return encryptedText;

            try
            {
                var withoutPrefix = encryptedText.Substring(_encryptedPrefix.Length);
                return _protector.Unprotect(withoutPrefix);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Warning: Failed to decrypt secret: {ex.Message}");
                return encryptedText; // Fallback to return encrypted text if decryption fails
            }
        }

        public Task<string> EncryptSecretAsync(string plainText)
        {
            return Task.FromResult(EncryptSecret(plainText));
        }

        public Task<string> DecryptSecretAsync(string encryptedText)
        {
            return Task.FromResult(DecryptSecret(encryptedText));
        }

        public bool IsEncrypted(string value)
        {
            return !string.IsNullOrEmpty(value) && value.StartsWith(_encryptedPrefix);
        }
    }
}