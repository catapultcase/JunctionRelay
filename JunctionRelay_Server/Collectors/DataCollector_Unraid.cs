using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Security.Authentication;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_Unraid : IDataCollector
    {
        public int CollectorId { get; private set; }
        public string CollectorName => "Unraid";

        private string _baseUrl = string.Empty;
        private string _apiKey = string.Empty;
        private HttpClient _client = null!;

        public void ApplyConfiguration(Model_Collector collector)
        {
            if (collector.URL is null)
                throw new ArgumentException("Collector.URL is required.");
            _baseUrl = collector.URL.TrimEnd('/');

            if (collector.DecryptedAccessToken is null)
                throw new ArgumentException("Collector.AccessToken is required.");
            _apiKey = collector.DecryptedAccessToken;

            CollectorId = collector.Id;

            // Initialize HttpClientHandler with SSL bypass for local connections
            HttpClientHandler handler = new HttpClientHandler
            {
                AllowAutoRedirect = true,
                ServerCertificateCustomValidationCallback = (message, cert, chain, errors) => true
            };

            _client = new HttpClient(handler)
            {
                BaseAddress = new Uri(_baseUrl + "/graphql")
            };

            _client.DefaultRequestHeaders.Clear();
            _client.DefaultRequestHeaders.Add("x-api-key", _apiKey);
        }

        private int GetDecimalPlaces(string value)
        {
            if (!decimal.TryParse(value, out decimal numericValue))
                return 0;

            string s = numericValue.ToString();
            int idx = s.IndexOf('.');
            return idx < 0 ? 0 : s.Length - idx - 1;
        }

        private async Task<JObject> ExecuteGraphQLQuery(string query, CancellationToken cancellationToken = default)
        {
            var payload = new { query = query };
            string json = JsonConvert.SerializeObject(payload);
            using var content = new StringContent(json, Encoding.UTF8, "application/json");

            HttpResponseMessage response;
            try
            {
                response = await _client.PostAsync(string.Empty, content, cancellationToken);
            }
            catch (HttpRequestException ex) when (ex.InnerException is AuthenticationException)
            {
                throw new InvalidOperationException(
                    "SSL handshake failed. Import your Unraid server certificate into this machine's trust store.", ex);
            }

            if (response.StatusCode == HttpStatusCode.Unauthorized)
                throw new InvalidOperationException(
                    "401 Unauthorized—your x-api-key was rejected. Ensure it exists and has the correct roles.");

            response.EnsureSuccessStatusCode();

            string body = await response.Content.ReadAsStringAsync(cancellationToken);
            JObject root = JObject.Parse(body);

            if (root["errors"] is JArray errors && errors.Count > 0)
            {
                string message = errors[0]?["message"]?.ToString() ?? "Unknown GraphQL error";
                throw new InvalidOperationException("GraphQL error: " + message);
            }

            return root;
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(
            Model_Collector collector,
            CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);
            List<Model_Sensor> sensors = new List<Model_Sensor>();
            try
            {
                await FetchSystemSensors(sensors, collector, cancellationToken);
                await FetchArraySensors(sensors, collector, cancellationToken);
                await FetchDockerSensors(sensors, collector, cancellationToken);
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error fetching Unraid sensors: " + ex.Message);
            }
            return sensors;
        }

        private async Task FetchSystemSensors(
            List<Model_Sensor> sensors,
            Model_Collector collector,
            CancellationToken cancellationToken)
        {
            string query = @"
                query {
                    info {
                        os { platform distro release uptime }
                        cpu { manufacturer brand cores threads }
                        memory { total free used }
                    }
                }";
            try
            {
                JObject result = await ExecuteGraphQLQuery(query, cancellationToken);
                JToken info = result["data"]?["info"];
                if (info != null)
                {
                    JToken os = info["os"];
                    if (os != null)
                    {
                        AddSensorIfNotNull(sensors, collector, "system.platform", os["platform"]?.ToString(), "N/A", "System");
                        AddSensorIfNotNull(sensors, collector, "system.distro", os["distro"]?.ToString(), "N/A", "System");
                        AddSensorIfNotNull(sensors, collector, "system.release", os["release"]?.ToString(), "N/A", "System");
                        AddSensorIfNotNull(sensors, collector, "system.uptime", os["uptime"]?.ToString(), "seconds", "System");
                    }
                    JToken cpu = info["cpu"];
                    if (cpu != null)
                    {
                        AddSensorIfNotNull(sensors, collector, "cpu.manufacturer", cpu["manufacturer"]?.ToString(), "N/A", "CPU");
                        AddSensorIfNotNull(sensors, collector, "cpu.brand", cpu["brand"]?.ToString(), "N/A", "CPU");
                        AddSensorIfNotNull(sensors, collector, "cpu.cores", cpu["cores"]?.ToString(), "cores", "CPU");
                        AddSensorIfNotNull(sensors, collector, "cpu.threads", cpu["threads"]?.ToString(), "threads", "CPU");
                    }
                    JToken memory = info["memory"];
                    if (memory != null)
                    {
                        AddSensorIfNotNull(sensors, collector, "memory.total", memory["total"]?.ToString(), "bytes", "Memory");
                        AddSensorIfNotNull(sensors, collector, "memory.free", memory["free"]?.ToString(), "bytes", "Memory");
                        AddSensorIfNotNull(sensors, collector, "memory.used", memory["used"]?.ToString(), "bytes", "Memory");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error fetching system sensors: " + ex.Message);
            }
        }

        private async Task FetchArraySensors(
            List<Model_Sensor> sensors,
            Model_Collector collector,
            CancellationToken cancellationToken)
        {
            string query = @"
                query {
                    array {
                        state
                        capacity { 
                            kilobytes { free used total }
                            disks { free used total } 
                        }
                        disks { name size status temp }
                    }
                }";
            try
            {
                JObject result = await ExecuteGraphQLQuery(query, cancellationToken);
                JToken arrayInfo = result["data"]?["array"];
                if (arrayInfo != null)
                {
                    AddSensorIfNotNull(sensors, collector, "array.state", arrayInfo["state"]?.ToString(), "N/A", "Array");

                    // Storage capacity in kilobytes
                    JToken storageCap = arrayInfo["capacity"]?["kilobytes"];
                    if (storageCap != null)
                    {
                        AddSensorIfNotNull(sensors, collector, "array.storage.free", storageCap["free"]?.ToString(), "KB", "Array");
                        AddSensorIfNotNull(sensors, collector, "array.storage.used", storageCap["used"]?.ToString(), "KB", "Array");
                        AddSensorIfNotNull(sensors, collector, "array.storage.total", storageCap["total"]?.ToString(), "KB", "Array");
                    }

                    // Disk slot capacity (number of disk bays)
                    JToken diskCap = arrayInfo["capacity"]?["disks"];
                    if (diskCap != null)
                    {
                        AddSensorIfNotNull(sensors, collector, "array.diskslots.free", diskCap["free"]?.ToString(), "slots", "Array");
                        AddSensorIfNotNull(sensors, collector, "array.diskslots.used", diskCap["used"]?.ToString(), "slots", "Array");
                        AddSensorIfNotNull(sensors, collector, "array.diskslots.total", diskCap["total"]?.ToString(), "slots", "Array");
                    }

                    JArray disks = arrayInfo["disks"] as JArray;
                    if (disks != null)
                    {
                        foreach (JToken disk in disks)
                        {
                            string? name = disk["name"]?.ToString();
                            if (string.IsNullOrEmpty(name)) continue;
                            AddSensorIfNotNull(sensors, collector, "disk." + name + ".size", disk["size"]?.ToString(), "bytes", "Disk", name);
                            AddSensorIfNotNull(sensors, collector, "disk." + name + ".status", disk["status"]?.ToString(), "N/A", "Disk", name);
                            AddSensorIfNotNull(sensors, collector, "disk." + name + ".temp", disk["temp"]?.ToString(), "°C", "Disk", name);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error fetching array sensors: " + ex.Message);
            }
        }

        private async Task FetchDockerSensors(
            List<Model_Sensor> sensors,
            Model_Collector collector,
            CancellationToken cancellationToken)
        {
            string query = @"
                query {
                    docker { containers { id names state status } }
                }";
            try
            {
                JObject result = await ExecuteGraphQLQuery(query, cancellationToken);
                JArray? containers = result["data"]?["docker"]?["containers"] as JArray;
                if (containers != null)
                {
                    foreach (JToken container in containers)
                    {
                        string? idField = container["id"]?.ToString();
                        JArray? names = container["names"] as JArray;
                        string? name = names?.FirstOrDefault()?.ToString() ?? idField;
                        if (string.IsNullOrEmpty(idField)) continue;

                        string cleanName = name?.TrimStart('/') ?? "unknown";

                        AddSensorIfNotNull(sensors, collector, $"docker.{cleanName}.state", container["state"]?.ToString(), "N/A", "Docker", cleanName);
                        AddSensorIfNotNull(sensors, collector, $"docker.{cleanName}.status", container["status"]?.ToString(), "N/A", "Docker", cleanName);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error fetching Docker sensors: " + ex.Message);
            }
        }

        private void AddSensorIfNotNull(
            List<Model_Sensor> sensors,
            Model_Collector collector,
            string externalId,
            string? value,
            string unit,
            string category,
            string? deviceName = null)
        {
            if (value is null) return;
            Model_Sensor sensor = new Model_Sensor
            {
                ExternalId = externalId,
                Name = deviceName ?? externalId.Replace(".", " ").Replace("_", " "),
                Value = value,
                Unit = unit,
                DecimalPlaces = GetDecimalPlaces(value),
                Category = category,
                DeviceName = deviceName ?? collector.Name,
                SensorType = "GraphQL",
                SensorTag = externalId,
                ComponentName = externalId,
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            };
            sensors.Add(sensor);
        }

        public async Task<List<Model_Sensor>> FetchSelectedSensorsAsync(
            Model_Collector collector,
            List<string> selectedSensorIds,
            CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);
            List<Model_Sensor> allSensors = await FetchSensorsAsync(collector, cancellationToken);
            return allSensors.Where(s => selectedSensorIds.Contains(s.ExternalId)).ToList();
        }

        public async Task<bool> TestConnectionAsync(
            Model_Collector collector,
            CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);
            try
            {
                JObject result = await ExecuteGraphQLQuery("query { info { os { platform } } }", cancellationToken);
                return result["data"]?["info"] != null;
            }
            catch
            {
                return false;
            }
        }

        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
            => Task.CompletedTask;

        public Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
            => Task.CompletedTask;

        public bool IsConnected(Model_Collector collector) => true;
    }
}