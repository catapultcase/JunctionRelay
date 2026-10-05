using System.Runtime.InteropServices;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_BackendIdentity
    {
        private readonly string _dbDirectory;
        private readonly string _backendIdentityFile;
        private readonly string _jwtSecretFile;

        private class BackendIdentity
        {
            public string Id { get; set; } = Guid.NewGuid().ToString("N");
            public string FriendlyName { get; set; } = "";
        }

        public Service_BackendIdentity(IWebHostEnvironment env)
        {
            _dbDirectory = GetDatabaseDirectory();
            _backendIdentityFile = Path.Combine(_dbDirectory, "backend-id.json");
            _jwtSecretFile = Path.Combine(_dbDirectory, "jwt-secret.key");
        }

        public string GetBackendId()
        {
            return LoadOrCreateIdentity().Id;
        }

        public string GetFriendlyName()
        {
            var identity = LoadOrCreateIdentity();
            if (string.IsNullOrWhiteSpace(identity.FriendlyName))
            {
                identity.FriendlyName = $"Backend-{identity.Id.Substring(0, 8)}";
                SaveIdentity(identity);
            }
            return identity.FriendlyName;
        }

        public void SetFriendlyName(string name)
        {
            var identity = LoadOrCreateIdentity();
            identity.FriendlyName = name;
            SaveIdentity(identity);
            Console.WriteLine($"Updated backend friendly name to: {name}");
        }

        public string GetJwtSecret()
        {
            try
            {
                if (File.Exists(_jwtSecretFile))
                {
                    var existingSecret = File.ReadAllText(_jwtSecretFile);
                    if (!string.IsNullOrWhiteSpace(existingSecret) && existingSecret.Length >= 32)
                    {
                        return existingSecret;
                    }
                }

                var randomBytes = new byte[48];
                using (var rng = System.Security.Cryptography.RandomNumberGenerator.Create())
                {
                    rng.GetBytes(randomBytes);
                }
                var newSecret = Convert.ToBase64String(randomBytes);

                EnsureDirectoryExists();
                File.WriteAllText(_jwtSecretFile, newSecret);
                Console.WriteLine("Generated new JWT secret for this installation");

                return newSecret;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"FATAL ERROR: Could not generate/load JWT secret: {ex.Message}");
                Console.WriteLine("Unable to secure local authentication. Please check file permissions and reinstall.");
                throw;
            }
        }

        public void DeleteIdentityFiles()
        {
            var deletedFiles = new List<string>();

            try
            {
                if (File.Exists(_backendIdentityFile))
                {
                    File.Delete(_backendIdentityFile);
                    deletedFiles.Add("backend-id.json");
                }

                if (File.Exists(_jwtSecretFile))
                {
                    File.Delete(_jwtSecretFile);
                    deletedFiles.Add("jwt-secret.key");
                }

                if (deletedFiles.Any())
                {
                    Console.WriteLine($"Deleted identity files: {string.Join(", ", deletedFiles)}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Warning: Could not delete some identity files: {ex.Message}");
            }
        }

        private BackendIdentity LoadOrCreateIdentity()
        {
            EnsureDirectoryExists();

            if (File.Exists(_backendIdentityFile))
            {
                try
                {
                    var json = File.ReadAllText(_backendIdentityFile);
                    var identity = JsonSerializer.Deserialize<BackendIdentity>(json);
                    if (identity != null && !string.IsNullOrWhiteSpace(identity.Id))
                    {
                        return identity;
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Warning: Failed to read backend identity file: {ex.Message}");
                }
            }

            var newIdentity = new BackendIdentity();
            newIdentity.FriendlyName = $"Backend-{newIdentity.Id.Substring(0, 8)}";
            SaveIdentity(newIdentity);
            Console.WriteLine($"Generated new backend ID: {newIdentity.Id.Substring(0, 8)}...");
            return newIdentity;
        }

        private void SaveIdentity(BackendIdentity identity)
        {
            var json = JsonSerializer.Serialize(identity, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_backendIdentityFile, json);
        }

        private void EnsureDirectoryExists()
        {
            if (!Directory.Exists(_dbDirectory))
            {
                Directory.CreateDirectory(_dbDirectory);
            }
        }

        private static string GetDatabaseDirectory()
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "JunctionRelay"
                );
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            {
                return Path.Combine(Directory.GetCurrentDirectory(), "data");
            }
            else
            {
                return Directory.GetCurrentDirectory();
            }
        }

        public static string GetDatabasePath()
        {
            var dbDirectory = GetDatabaseDirectory();
            return Path.Combine(dbDirectory, "jr_database.db");
        }
    }
}
