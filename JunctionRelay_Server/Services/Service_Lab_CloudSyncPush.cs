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

using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    // Lab module (HOMELAB) + Models module — the cloud snapshot push.
    //
    // Builds the allowlisted projection (Model_Lab_SyncContract.cs — the DTOs
    // ARE the allowlist; entities are never serialized) and POSTs it to the
    // cloud, which wipe-replaces this user's mirror. Off by default
    // (Lab.CloudSync.Enabled), Pro-gated cloud-side.
    public class Service_Lab_CloudSyncPush
    {
        public const string EnabledKey = "Lab.CloudSync.Enabled";
        public const string IntervalMinutesKey = "Lab.CloudSync.IntervalMinutes";
        public const string SourceNameKey = "Lab.CloudSync.SourceName";

        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Service_CloudSessionStore _cloudSessionStore;
        private readonly IService_Settings _settings;

        private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

        // Status is in-memory: it describes THIS process's pushes, not history.
        private readonly object _statusLock = new();
        public DateTime? LastAttemptAt { get; private set; }
        public DateTime? LastSuccessAt { get; private set; }
        public string? LastError { get; private set; }
        public Dictionary<string, int>? LastCounts { get; private set; }

        public Service_Lab_CloudSyncPush(
            IServiceScopeFactory scopeFactory,
            IHttpClientFactory httpClientFactory,
            Service_CloudSessionStore cloudSessionStore,
            IService_Settings settings)
        {
            _scopeFactory = scopeFactory;
            _httpClientFactory = httpClientFactory;
            _cloudSessionStore = cloudSessionStore;
            _settings = settings;
        }

        private static string CloudBaseUrl =>
            Environment.GetEnvironmentVariable("CLOUD_BACKEND_URL") ?? "https://api.junctionrelay.com";

        public async Task<bool> IsEnabledAsync() =>
            string.Equals(await _settings.GetSettingAsync(EnabledKey), "true", StringComparison.OrdinalIgnoreCase);

        public async Task<int> IntervalMinutesAsync()
        {
            var raw = await _settings.GetSettingAsync(IntervalMinutesKey);
            return int.TryParse(raw, out var v) && v >= 1 ? v : 10;
        }

        // ------------------------------------------------------------------
        // Snapshot build — reads via the same managers the UI and MCP use,
        // projects into the contract DTOs. Only allowlisted fields are copied;
        // a field the contract does not name never reaches the serializer.
        // ------------------------------------------------------------------
        public async Task<Model_Lab_SyncSnapshot> BuildSnapshotAsync()
        {
            using var scope = _scopeFactory.CreateScope();
            var sp = scope.ServiceProvider;

            var machines = (await sp.GetRequiredService<Service_Database_Manager_Lab_Machines>().GetAllMachinesAsync()).ToList();
            var components = (await sp.GetRequiredService<Service_Database_Manager_Lab_Components>().GetAllComponentsAsync()).ToList();
            var movements = (await sp.GetRequiredService<Service_Database_Manager_Lab_Components>().GetAllMovementsAsync()).ToList();
            var types = (await sp.GetRequiredService<Service_Database_Manager_Lab_ComponentTypes>().GetAllAsync(includeRetired: true)).ToList();
            var spacesMgr = sp.GetRequiredService<Service_Database_Manager_Lab_Spaces>();
            var spaces = (await spacesMgr.GetAllSpacesAsync()).ToList();
            var placements = (await spacesMgr.GetPlacementsAsync()).ToList();
            var attachments = (await sp.GetRequiredService<Service_Database_Manager_Lab_Attachments>().GetAttachmentsAsync(null, null)).ToList();
            var marketValues = (await sp.GetRequiredService<Service_Database_Manager_Lab_MarketValues>().GetAllAsync()).ToList();
            var groups = (await sp.GetRequiredService<Service_Database_Manager_Lab_MachineGroups>().GetAllGroupsAsync()).ToList();
            var modelsCatalog = (await sp.GetRequiredService<Service_Database_Manager_Models_Catalog>().GetAllAsync()).ToList();
            var modelsServing = (await sp.GetRequiredService<Service_Database_Manager_Models_Serving>().GetAllAsync()).ToList();

            // ⛔ THE BENCHMARK LEDGER AND THE FIT VERDICTS DO NOT LEAVE THIS MACHINE.
            // The cloud has no Benchmarks/Reports pages and its MCP does not answer
            // for them. The contract keeps the two lists, which travel EMPTY; speed and
            // refusals are read on the local server (its pages and its MCP head).
            //
            // v3: cited scores are catalog-domain facts about the checkpoint and still
            // travel.
            var referenceScores = (await sp.GetRequiredService<Service_Database_Manager_Models_ReferenceScores>().GetAllAsync()).ToList();

            var sourceName = await _settings.GetSettingAsync(SourceNameKey);

            return new Model_Lab_SyncSnapshot
            {
                SchemaVersion = Model_Lab_SyncSnapshot.CurrentSchemaVersion,
                GeneratedAt = DateTime.UtcNow,
                // A display NAME, never a hostname. Defaults to the product name.
                SourceHost = string.IsNullOrWhiteSpace(sourceName) ? "junctionrelay" : sourceName.Trim(),
                Lab = new SyncLab
                {
                    Machines = machines.Select(m => new SyncLabMachine
                    {
                        Id = m.Id, Name = m.Name, Kind = m.Kind, Role = m.Role, Status = m.Status,
                        OS = m.OS, AlwaysOn = m.AlwaysOn, LinkedDeviceId = m.LinkedDeviceId,
                        CreatedAt = m.CreatedAt, UpdatedAt = m.UpdatedAt
                    }).ToList(),
                    Components = components.Select(c => new SyncLabComponent
                    {
                        Id = c.Id, Type = c.Type, Name = c.Name, Manufacturer = c.Manufacturer,
                        Model = c.Model, Nickname = c.Nickname, Sku = c.Sku, Spec = c.Spec,
                        Status = c.Status, CurrentMachineId = c.CurrentMachineId,
                        ParentComponentId = c.ParentComponentId, ReleaseDate = c.ReleaseDate,
                        Msrp = c.Msrp, ListPrice = c.ListPrice, ListPriceDate = c.ListPriceDate,
                        PurchasePrice = c.PurchasePrice, AcquiredAt = c.AcquiredAt,
                        Source = c.Source, Vendor = c.Vendor, WarrantyYears = c.WarrantyYears,
                        CreatedAt = c.CreatedAt, UpdatedAt = c.UpdatedAt
                    }).ToList(),
                    Movements = movements.Select(mv => new SyncLabComponentMovement
                    {
                        Id = mv.Id, ComponentId = mv.ComponentId, FromMachineId = mv.FromMachineId,
                        ToMachineId = mv.ToMachineId, SlotLabel = mv.SlotLabel,
                        MovedAt = mv.MovedAt, CreatedAt = mv.CreatedAt
                    }).ToList(),
                    ComponentTypes = types.Select(t => new SyncLabComponentType
                    {
                        Id = t.Id, Name = t.Name, Label = t.Label, SortOrder = t.SortOrder,
                        Status = t.Status, Icon = t.Icon, FieldsJson = t.FieldsJson
                    }).ToList(),
                    Spaces = spaces.Select(s => new SyncLabSpace
                    {
                        Id = s.Id, Name = s.Name, Kind = s.Kind, ComponentId = s.ComponentId,
                        ParentSpaceId = s.ParentSpaceId, HeightU = s.HeightU,
                        WidthInches = s.WidthInches, DepthInches = s.DepthInches,
                        Status = s.Status, SortOrder = s.SortOrder,
                        CreatedAt = s.CreatedAt, UpdatedAt = s.UpdatedAt
                    }).ToList(),
                    Placements = placements.Select(p => new SyncLabPlacement
                    {
                        Id = p.Id, SpaceId = p.SpaceId, MachineId = p.MachineId,
                        ComponentId = p.ComponentId, PositionU = p.PositionU, HeightU = p.HeightU,
                        Face = p.Face, Status = p.Status,
                        CreatedAt = p.CreatedAt, UpdatedAt = p.UpdatedAt
                    }).ToList(),
                    Attachments = attachments.Select(a => new SyncLabAttachment
                    {
                        Id = a.Id, ComponentId = a.ComponentId, MachineId = a.MachineId,
                        Kind = a.Kind, FileName = a.FileName, ContentType = a.ContentType,
                        SizeBytes = a.SizeBytes ?? 0, Sha256 = a.Sha256, CreatedAt = a.CreatedAt
                    }).ToList(),
                    MarketValues = marketValues.Select(v => new SyncLabMarketValue
                    {
                        Id = v.Id, ComponentId = v.ComponentId, Value = v.Value,
                        Condition = v.Condition, Source = v.Source, SourceUrl = v.SourceUrl,
                        CapturedAt = v.CapturedAt, CreatedAt = v.CreatedAt
                    }).ToList(),
                    MachineGroups = groups.Select(g => new SyncLabMachineGroup
                    {
                        Id = g.Id, Name = g.Name, Field = g.Field, RolesJson = g.RolesJson,
                        SortOrder = g.SortOrder, CreatedAt = g.CreatedAt, UpdatedAt = g.UpdatedAt
                    }).ToList(),
                },
                Models = new SyncModels
                {
                    Catalog = modelsCatalog.Select(m => new SyncModelsCatalogEntry
                    {
                        Id = m.Id, Name = m.Name, Family = m.Family, ParamsB = m.ParamsB,
                        Architecture = m.Architecture, ActiveParamsB = m.ActiveParamsB,
                        Quant = m.Quant, QuantsJson = m.QuantsJson,
                        ContextLength = m.ContextLength,
                        KvCachePrecision = m.KvCachePrecision, SizeGb = m.SizeGb,
                        TraitsJson = m.TraitsJson, Category = m.Category, Status = m.Status,
                        SupersededById = m.SupersededById,
                        CreatedAt = m.CreatedAt, UpdatedAt = m.UpdatedAt
                    }).ToList(),
                    Serving = modelsServing.Select(s => new SyncModelsServingAssignment
                    {
                        Id = s.Id, ModelId = s.ModelId, MachineId = s.MachineId, Alias = s.Alias,
                        Mode = s.Mode, IsDefault = s.IsDefault, Status = s.Status,
                        Quant = s.Quant, ContextTokens = s.ContextTokens, Slots = s.Slots,
                        KvPrecision = s.KvPrecision, Mtp = s.Mtp, Vision = s.Vision,
                        WeightsGb = s.WeightsGb,
                        CreatedAt = s.CreatedAt, UpdatedAt = s.UpdatedAt
                    }).ToList(),
                    Benchmarks = new List<SyncModelsBenchmark>(),   // never synced
                    ReferenceScores = referenceScores.Select(r => new SyncModelsReferenceScore
                    {
                        Id = r.Id, ModelId = r.ModelId, Benchmark = r.Benchmark,
                        Score = r.Score, Source = r.Source,
                        Provenance = r.Provenance, EvaluatedPrecision = r.EvaluatedPrecision,
                        Scaffold = r.Scaffold, EvaluatedContextTokens = r.EvaluatedContextTokens,
                        CapturedAt = r.CapturedAt
                    }).ToList(),
                    FitVerdicts = new List<SyncModelsFitVerdict>(),  // never synced
                }
            };
        }

        // ------------------------------------------------------------------
        // Push
        // ------------------------------------------------------------------
        public async Task<(bool ok, string message)> PushSnapshotAsync(CancellationToken cancellationToken = default)
        {
            lock (_statusLock) { LastAttemptAt = DateTime.UtcNow; }

            try
            {
                var token = await _cloudSessionStore.GetValidAccessTokenAsync(cancellationToken);
                if (string.IsNullOrEmpty(token))
                {
                    return Fail("Not logged into JunctionRelay Cloud");
                }

                var snapshot = await BuildSnapshotAsync();
                var json = ScrubPrivateIps(JsonSerializer.Serialize(snapshot, JsonOpts));

                var req = new HttpRequestMessage(HttpMethod.Post, $"{CloudBaseUrl}/lab-sync/snapshot")
                {
                    Content = new StringContent(json, Encoding.UTF8, "application/json")
                };
                req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var httpClient = _httpClientFactory.CreateClient();
                var resp = await httpClient.SendAsync(req, cancellationToken);

                if (resp.IsSuccessStatusCode)
                {
                    lock (_statusLock)
                    {
                        LastSuccessAt = DateTime.UtcNow;
                        LastError = null;
                        LastCounts = new Dictionary<string, int>
                        {
                            ["machines"] = snapshot.Lab.Machines.Count,
                            ["components"] = snapshot.Lab.Components.Count,
                            ["movements"] = snapshot.Lab.Movements.Count,
                            ["marketValues"] = snapshot.Lab.MarketValues.Count,
                            ["spaces"] = snapshot.Lab.Spaces.Count,
                            ["attachments"] = snapshot.Lab.Attachments.Count,
                            ["modelsCatalog"] = snapshot.Models.Catalog.Count,
                        };
                    }
                    Console.WriteLine($"[LAB_CLOUDSYNC] ☁️ Snapshot pushed ({snapshot.Lab.Components.Count} components, " +
                                      $"{snapshot.Models.Catalog.Count} models, {json.Length / 1024} KB)");
                    return (true, "Snapshot pushed");
                }

                var body = await resp.Content.ReadAsStringAsync(cancellationToken);
                if ((int)resp.StatusCode == 403 && body.Contains("pro_required"))
                {
                    return Fail("Cloud sync requires a Pro subscription");
                }
                if ((int)resp.StatusCode == 409)
                {
                    return Fail("Cloud is older than this server's sync contract — deploy the cloud first");
                }
                return Fail($"Cloud returned {(int)resp.StatusCode}");
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                return Fail("Cancelled");
            }
            catch (Exception ex)
            {
                return Fail(ex.Message);
            }

            (bool, string) Fail(string message)
            {
                lock (_statusLock) { LastError = message; }
                Console.WriteLine($"[LAB_CLOUDSYNC] ⚠️ Snapshot push failed: {message}");
                return (false, message);
            }
        }

        // ------------------------------------------------------------------
        // The allowlist stops excluded FIELDS; it cannot stop an address typed
        // into an allowed free-text field (a machine's OS can read
        // 'Ubuntu Server · 192.168.1.50'). Belt-and-braces: the
        // serialized payload is scrubbed of RFC1918 literals before it leaves.
        // Safe on JSON text — a dotted quad can only occur inside a string
        // value; JSON numbers cannot contain multiple dots.
        // ------------------------------------------------------------------
        private static readonly Regex PrivateIpPattern = new(
            @"\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}" +
            @"|192\.168\.\d{1,3}\.\d{1,3}" +
            @"|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b",
            RegexOptions.Compiled);

        public static string ScrubPrivateIps(string json) =>
            PrivateIpPattern.Replace(json, "[ip-removed]");

        // ------------------------------------------------------------------
        // Contract summary — reflection over the DTO types, so the Settings
        // UI's "review what leaves this machine" table can never drift from
        // the code that actually serializes.
        // ------------------------------------------------------------------
        public static Dictionary<string, List<string>> GetContractSummary()
        {
            var entityTypes = new (string Name, Type Type)[]
            {
                ("Machines", typeof(SyncLabMachine)),
                ("Components", typeof(SyncLabComponent)),
                ("Movements", typeof(SyncLabComponentMovement)),
                ("ComponentTypes", typeof(SyncLabComponentType)),
                ("Spaces", typeof(SyncLabSpace)),
                ("Placements", typeof(SyncLabPlacement)),
                ("Attachments (metadata only)", typeof(SyncLabAttachment)),
                ("MarketValues", typeof(SyncLabMarketValue)),
                ("MachineGroups", typeof(SyncLabMachineGroup)),
                ("Models.Catalog", typeof(SyncModelsCatalogEntry)),
                ("Models.Serving", typeof(SyncModelsServingAssignment)),
                // Models.Benchmarks and Models.FitVerdicts are NOT in this list on
                // purpose: they stopped leaving the machine.
            };

            return entityTypes.ToDictionary(
                e => e.Name,
                e => e.Type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                          .Select(p => p.Name)
                          .ToList());
        }
    }
}
