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

            // Initialize HttpClientHandler to follow HTTP→HTTPS redirects
            HttpClientHandler handler = new HttpClientHandler
            {
                AllowAutoRedirect = true
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

            Console.WriteLine("DEBUG: POST " + _client.BaseAddress);
            HttpResponseMessage response;
            try
            {
                response = await _client.PostAsync(string.Empty, content, cancellationToken);
            }
            catch (HttpRequestException ex) when (ex.InnerException is AuthenticationException)
            {
                throw new InvalidOperationException(
                    "SSL handshake failed. Import your Unraid server certificate into this machine’s trust store.", ex);
            }

            if (response.StatusCode == HttpStatusCode.Unauthorized)
                throw new InvalidOperationException(
                    "401 Unauthorized—your x-api-key was rejected. Ensure it exists and has the correct roles.");

            response.EnsureSuccessStatusCode();

            string body = await response.Content.ReadAsStringAsync(cancellationToken);
            Console.WriteLine("DEBUG: Response JSON: " + body);

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
                        capacity { disks { free used total } }
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
                    JToken cap = arrayInfo["capacity"]?["disks"];
                    if (cap != null)
                    {
                        AddSensorIfNotNull(sensors, collector, "array.capacity.free", cap["free"]?.ToString(), "bytes", "Array");
                        AddSensorIfNotNull(sensors, collector, "array.capacity.used", cap["used"]?.ToString(), "bytes", "Array");
                        AddSensorIfNotNull(sensors, collector, "array.capacity.total", cap["total"]?.ToString(), "bytes", "Array");
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
                    dockerContainers { id names state status autoStart }
                }";
            try
            {
                JObject result = await ExecuteGraphQLQuery(query, cancellationToken);
                JArray? containers = result["data"]?["dockerContainers"] as JArray;
                if (containers != null)
                {
                    foreach (JToken container in containers)
                    {
                        string? idField = container["id"]?.ToString();
                        JArray? names = container["names"] as JArray;
                        string? name = names?.FirstOrDefault()?.ToString() ?? idField;
                        if (string.IsNullOrEmpty(idField)) continue;
                        string shortId = idField.Length > 12 ? idField.Substring(0, 12) : idField;
                        AddSensorIfNotNull(sensors, collector, "docker." + shortId + ".state", container["state"]?.ToString(), "N/A", "Docker", name);
                        AddSensorIfNotNull(sensors, collector, "docker." + shortId + ".status", container["status"]?.ToString(), "N/A", "Docker", name);
                        AddSensorIfNotNull(sensors, collector, "docker." + shortId + ".autoStart", container["autoStart"]?.ToString(), "N/A", "Docker", name);
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
