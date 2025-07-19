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
using Microsoft.AspNetCore.DataProtection;
using System;
using System.Security.Cryptography;
using System.Threading.Tasks;

namespace JunctionRelayServer.Services
{
    public class Service_Secrets : ISecretsService
    {
        private readonly IDataProtector _protector;
        private readonly string _encryptedPrefix = "ENC_";

        public Service_Secrets(IDataProtectionProvider dataProtectionProvider)
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

        public string EncryptWithPassword(string plainText, string password)
        {
            if (string.IsNullOrEmpty(plainText))
                throw new ArgumentException("Plaintext cannot be null or empty.");
            if (string.IsNullOrEmpty(password))
                throw new ArgumentException("Password cannot be null or empty.");

            try
            {
                // Generate random salt and IV
                byte[] salt = RandomNumberGenerator.GetBytes(16);
                byte[] iv = RandomNumberGenerator.GetBytes(16);

                // Derive key from password
                using var keyDerivationFunc = new Rfc2898DeriveBytes(password, salt, 100_000, HashAlgorithmName.SHA256);
                byte[] key = keyDerivationFunc.GetBytes(32); // AES-256

                using var aes = Aes.Create();
                aes.Key = key;
                aes.IV = iv;
                aes.Mode = CipherMode.CBC;
                aes.Padding = PaddingMode.PKCS7;

                using var encryptor = aes.CreateEncryptor();
                byte[] plainBytes = System.Text.Encoding.UTF8.GetBytes(plainText);
                byte[] cipherBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);

                // Combine salt + IV + ciphertext
                byte[] result = new byte[salt.Length + iv.Length + cipherBytes.Length];
                Buffer.BlockCopy(salt, 0, result, 0, salt.Length);
                Buffer.BlockCopy(iv, 0, result, salt.Length, iv.Length);
                Buffer.BlockCopy(cipherBytes, 0, result, salt.Length + iv.Length, cipherBytes.Length);

                return "PWENC_" + Convert.ToBase64String(result);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Warning: Failed to encrypt with password: {ex.Message}");
                return plainText; // fallback
            }
        }

        // FIXED: This method now throws exceptions on wrong password instead of falling back
        public string DecryptWithPassword(string encryptedText, string password)
        {
            if (string.IsNullOrEmpty(encryptedText))
                return encryptedText;

            if (!encryptedText.StartsWith("PWENC_"))
                return encryptedText;

            if (string.IsNullOrEmpty(password))
                throw new UnauthorizedAccessException("Password is required for decryption");

            try
            {
                byte[] fullData = Convert.FromBase64String(encryptedText.Substring("PWENC_".Length));

                if (fullData.Length < 32) // Need at least salt (16) + IV (16)
                    throw new InvalidOperationException("Invalid encrypted data format");

                byte[] salt = fullData[..16];
                byte[] iv = fullData[16..32];
                byte[] cipherBytes = fullData[32..];

                using var keyDerivationFunc = new Rfc2898DeriveBytes(password, salt, 100_000, HashAlgorithmName.SHA256);
                byte[] key = keyDerivationFunc.GetBytes(32);

                using var aes = Aes.Create();
                aes.Key = key;
                aes.IV = iv;
                aes.Mode = CipherMode.CBC;
                aes.Padding = PaddingMode.PKCS7;

                using var decryptor = aes.CreateDecryptor();
                byte[] decryptedBytes = decryptor.TransformFinalBlock(cipherBytes, 0, cipherBytes.Length);

                return System.Text.Encoding.UTF8.GetString(decryptedBytes);
            }
            catch (CryptographicException ex)
            {
                // This specifically catches wrong password/decryption failures
                Console.WriteLine($"Decryption failed - likely wrong password: {ex.Message}");
                throw new UnauthorizedAccessException("Invalid password or corrupted data", ex);
            }
            catch (FormatException ex)
            {
                // This catches base64 decoding errors
                Console.WriteLine($"Invalid encrypted data format: {ex.Message}");
                throw new InvalidOperationException("Invalid encrypted data format", ex);
            }
            catch (Exception ex)
            {
                // Any other errors during decryption
                Console.WriteLine($"Unexpected error during password decryption: {ex.Message}");
                throw new InvalidOperationException("Failed to decrypt data", ex);
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