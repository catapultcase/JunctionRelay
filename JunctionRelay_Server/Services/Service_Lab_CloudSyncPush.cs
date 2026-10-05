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
    // (Lab.CloudSync.Share: a category, then features inside it, each opted
    // into on its own - Model_Lab_CloudShare), Pro-gated cloud-side.
    public class Service_Lab_CloudSyncPush
    {
        public const string ShareKey = "Lab.CloudSync.Share";
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

        public async Task<Model_Lab_CloudShare> GetShareAsync()
        {
            var raw = await _settings.GetSettingAsync(ShareKey);
            if (string.IsNullOrWhiteSpace(raw)) return new Model_Lab_CloudShare();
            try { return JsonSerializer.Deserialize<Model_Lab_CloudShare>(raw, JsonOpts) ?? new Model_Lab_CloudShare(); }
            catch (JsonException ex)
            {
                Console.WriteLine($"[LAB_CLOUDSYNC] Unreadable share setting, sharing nothing: {ex.Message}");
                return new Model_Lab_CloudShare();
            }
        }

        public Task SetShareAsync(Model_Lab_CloudShare share) =>
            _settings.SetSettingAsync(ShareKey, JsonSerializer.Serialize(share, JsonOpts),
                "What is shared with JunctionRelay Cloud: categories and the features opted into inside them");

        // Pushing runs while anything is shared.
        public async Task<bool> IsEnabledAsync() => (await GetShareAsync()).Any;

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
            var share = await GetShareAsync();
            var lab = share.Homelab.Enabled ? share.Homelab : new Model_Lab_CloudShare.HomelabShare();
            var mod = share.Models.Enabled ? share.Models : new Model_Lab_CloudShare.ModelsShare();

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

            // Fit verdicts never leave this machine; benchmark results leave only when the user shares
            // them (v6). Cited reference scores are catalog facts about the checkpoint.
            var referenceScores = (await sp.GetRequiredService<Service_Database_Manager_Models_ReferenceScores>().GetAllAsync()).ToList();
            var benchmarks = (await sp.GetRequiredService<Service_Database_Manager_Models_Benchmarks>().GetAllAsync()).ToList();

            // What is not shared travels empty. With Homelab off but the serving map on, the
            // machines that serve a model go up by id and NAME only, so the map can be read.
            if (!mod.Enabled) { modelsCatalog.Clear(); modelsServing.Clear(); referenceScores.Clear(); benchmarks.Clear(); }
            if (!mod.Benchmarks) benchmarks.Clear();
            if (!mod.Serving) modelsServing.Clear();
            if (!mod.Scores) referenceScores.Clear();
            if (!lab.Enabled)
            {
                var serving = modelsServing.Select(s => s.MachineId).ToHashSet();
                machines = machines.Where(m => serving.Contains(m.Id)).ToList();
                components.Clear(); types.Clear(); groups.Clear();
            }
            if (!lab.Movements) movements.Clear();
            if (!lab.Spaces) { spaces.Clear(); placements.Clear(); }
            if (!lab.Attachments) attachments.Clear();
            if (!lab.Purchases) marketValues.Clear();

            var sourceName = await _settings.GetSettingAsync(SourceNameKey);

            return new Model_Lab_SyncSnapshot
            {
                SchemaVersion = Model_Lab_SyncSnapshot.CurrentSchemaVersion,
                GeneratedAt = DateTime.UtcNow,
                // A display NAME, never a hostname. Defaults to the product name.
                SourceHost = string.IsNullOrWhiteSpace(sourceName) ? "junctionrelay" : sourceName.Trim(),
                Shared = new SyncShared
                {
                    Homelab = { Enabled = lab.Enabled, Movements = lab.Movements, Purchases = lab.Purchases, Spaces = lab.Spaces, Attachments = lab.Attachments },
                    Models = { Enabled = mod.Enabled, Serving = mod.Serving, Scores = mod.Scores, Benchmarks = mod.Benchmarks },
                },
                Lab = new SyncLab
                {
                    Machines = machines.Select(m => new SyncLabMachine
                    {
                        Id = m.Id, Name = m.Name,
                        Kind = lab.Enabled ? m.Kind : null, Role = lab.Enabled ? m.Role : null,
                        Status = lab.Enabled ? m.Status : "active", OS = lab.Enabled ? m.OS : null,
                        AlwaysOn = lab.Enabled && m.AlwaysOn, LinkedDeviceId = lab.Enabled ? m.LinkedDeviceId : null,
                        CreatedAt = lab.Enabled ? m.CreatedAt : null, UpdatedAt = lab.Enabled ? m.UpdatedAt : null
                    }).ToList(),
                    Components = components.Select(c => new SyncLabComponent
                    {
                        Id = c.Id, Type = c.Type, Name = c.Name, Manufacturer = c.Manufacturer,
                        Model = c.Model, Nickname = c.Nickname, Sku = c.Sku, Spec = c.Spec,
                        Status = c.Status, CurrentMachineId = c.CurrentMachineId,
                        ParentComponentId = c.ParentComponentId, ReleaseDate = c.ReleaseDate,
                        // Purchases & prices: only when that feature is opted into
                        Msrp = lab.Purchases ? c.Msrp : null, ListPrice = lab.Purchases ? c.ListPrice : null,
                        ListPriceDate = lab.Purchases ? c.ListPriceDate : null,
                        PurchasePrice = lab.Purchases ? c.PurchasePrice : null, AcquiredAt = lab.Purchases ? c.AcquiredAt : null,
                        Source = lab.Purchases ? c.Source : null, Vendor = lab.Purchases ? c.Vendor : null,
                        WarrantyYears = lab.Purchases ? c.WarrantyYears : null,
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
                    // Speeds measured here - only when the user shares benchmark results.
                    Benchmarks = benchmarks.Select(b => new SyncModelsBenchmark
                    {
                        Id = b.Id, ModelName = b.ModelName, ModelId = b.ModelId, MachineId = b.MachineId,
                        Metric = b.Metric, Value = b.Value, Quant = b.Quant, ContextTokens = b.ContextTokens,
                        Slots = b.Slots, KvPrecision = b.KvPrecision, Mtp = b.Mtp, Vision = b.Vision,
                        Engine = b.Engine, WeightsGb = b.WeightsGb, CapturedAt = b.CapturedAt,
                        Source = b.Source, Scenario = b.Scenario, CreatedAt = b.CreatedAt
                    }).ToList(),
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
        // The share page's categories and features with the exact fields each sends, read off the
        // contract DTOs so the page can never list less (or more) than what leaves.
        private static readonly string[] PurchaseFields =
            { "Msrp", "ListPrice", "ListPriceDate", "PurchasePrice", "AcquiredAt", "Source", "Vendor", "WarrantyYears" };
        private static List<string> FieldsOf(Type t, Func<string, bool>? keep = null) =>
            t.GetProperties(BindingFlags.Public | BindingFlags.Instance).Select(p => p.Name)
             .Where(n => n is not ("Id" or "CreatedAt" or "UpdatedAt") && (keep == null || keep(n))).ToList();

        public static Model_Lab_ShareContract GetShareContract() => new()
        {
            SchemaVersion = Model_Lab_SyncSnapshot.CurrentSchemaVersion,
            Categories =
            {
                new()
                {
                    Key = "homelab", Label = "Homelab",
                    Features =
                    {
                        new() { Key = "base", Label = "Inventory",
                            Description = "Your machines and the parts in them: names, what each part is (make, model, size), whether it is in use or on the shelf, and which machine it is in. No prices, no serial numbers.",
                            Fields = { ["Machines"] = FieldsOf(typeof(SyncLabMachine)),
                                       ["Components"] = FieldsOf(typeof(SyncLabComponent), n => !PurchaseFields.Contains(n)),
                                       ["Component types"] = FieldsOf(typeof(SyncLabComponentType)),
                                       ["Machine groups"] = FieldsOf(typeof(SyncLabMachineGroup)) } },
                        new() { Key = "movements", Label = "Part history",
                            Description = "When a part moved from one machine to another, or to the shelf, and which slot it went into.",
                            Fields = { ["Movements"] = FieldsOf(typeof(SyncLabComponentMovement)) } },
                        new() { Key = "purchases", Label = "Purchases & prices",
                            Description = "What you paid for each part, the shop you bought it from, when, its warranty, its launch and list price, and the market prices you have recorded over time.",
                            Fields = { ["Components"] = FieldsOf(typeof(SyncLabComponent), n => PurchaseFields.Contains(n)),
                                       ["Market values"] = FieldsOf(typeof(SyncLabMarketValue)) } },
                        new() { Key = "spaces", Label = "Spaces & racks",
                            Description = "The names of your rooms, racks and desks, and which machine sits where (rack positions). Not where your home is.",
                            Fields = { ["Spaces"] = FieldsOf(typeof(SyncLabSpace)), ["Placements"] = FieldsOf(typeof(SyncLabPlacement)) } },
                        new() { Key = "attachments", Label = "Attachment details",
                            Description = "The file name, type and size of invoices and documents you attached. The files themselves never leave this machine.",
                            Fields = { ["Attachments"] = FieldsOf(typeof(SyncLabAttachment)) } },
                    },
                    NeverShared = { "IP addresses", "hostnames", "serial numbers", "your notes", "detailed spec values",
                                    "attached files and where they are stored", "physical and storage locations", "the network map", "backups", "observations" },
                },
                new()
                {
                    Key = "models", Label = "Models",
                    Features =
                    {
                        new() { Key = "base", Label = "Catalog",
                            Description = "The AI models you keep: their names, family, size, quantisations and context length.",
                            Fields = { ["Catalog"] = FieldsOf(typeof(SyncModelsCatalogEntry)) } },
                        new() { Key = "serving", Label = "Serving map",
                            Description = "Which machine runs which model, and its settings (quant, context, slots). This also shares the names of those machines, even if Homelab is not shared.",
                            Fields = { ["Serving"] = FieldsOf(typeof(SyncModelsServingAssignment)), ["Machines"] = new() { "Name" } } },
                        new() { Key = "scores", Label = "Reference scores",
                            Description = "Published benchmark scores you have cited for each model, with the link to where they were published.",
                            Fields = { ["Reference scores"] = FieldsOf(typeof(SyncModelsReferenceScore)) } },
                        new() { Key = "benchmarks", Label = "Benchmark results",
                            Description = "The speeds you measured on your own machines (tokens per second, time to first token) and the setup each was measured with.",
                            Fields = { ["Benchmarks"] = FieldsOf(typeof(SyncModelsBenchmark)) } },
                    },
                    NeverShared = { "fit verdicts (what will not load where)", "benchmark notes and raw run settings", "where model files are stored", "serving ports and addresses" },
                },
            },
        };
    }
}
