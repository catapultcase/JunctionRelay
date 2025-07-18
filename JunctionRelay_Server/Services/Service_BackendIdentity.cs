using System.Runtime.InteropServices;

namespace JunctionRelayServer.Services
{
    public class Service_BackendIdentity
    {
        private readonly string _dbDirectory;
        private readonly string _backendIdFile;
        private readonly string _jwtSecretFile;

        public Service_BackendIdentity(IWebHostEnvironment env)
        {
            _dbDirectory = GetDatabaseDirectory();
            _backendIdFile = Path.Combine(_dbDirectory, "backend-id.txt");
            _jwtSecretFile = Path.Combine(_dbDirectory, "jwt-secret.key");
        }

        public string GetBackendId()
        {
            try
            {
                if (File.Exists(_backendIdFile))
                {
                    var existingId = File.ReadAllText(_backendIdFile).Trim();
                    if (!string.IsNullOrWhiteSpace(existingId) && existingId.Length >= 8)
                        return existingId;
                }

                var newId = Guid.NewGuid().ToString("N");
                EnsureDirectoryExists();
                File.WriteAllText(_backendIdFile, newId);
                Console.WriteLine($"Generated new backend ID: {newId.Substring(0, 8)}...");
                return newId;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"ERROR: Could not generate/load backend ID: {ex.Message}");
                throw;
            }
        }

        public string GetFriendlyName()
        {
            var backendId = GetBackendId();
            return $"Backend-{backendId.Substring(0, 8)}";
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
                if (File.Exists(_backendIdFile))
                {
                    File.Delete(_backendIdFile);
                    deletedFiles.Add("backend-id.txt");
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