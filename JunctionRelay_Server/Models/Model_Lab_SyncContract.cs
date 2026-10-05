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

namespace JunctionRelayServer.Models
{
    // ============================================================================
    // THE CLOUD SYNC CONTRACT — what is allowed to leave this machine.
    //
    // ⚠️ FIELD-LEVEL ALLOWLIST, NEVER A BLOCKLIST. The serializer only ever
    // touches these DTOs — never the entity classes, whose derived-on-read
    // display properties (SpaceName, LastObservedValue, OccupantLabel…) must
    // not leak into a wire format. A property here IS the decision that the
    // field is safe to sync; anything not listed does not leave, ever, even
    // when a column is added to the entity later.
    //
    // Excluded on purpose, everywhere:
    //   IPAddress, Hostname          network identity
    //   SerialNumber                 device identity
    //   Notes / Reason /
    //     ListPriceNotes             free text — can hold anything
    //   SpecJson                     free-form key/values — can hold anything
    //   Lab_Attachments.StoredName   a filesystem path (metadata only syncs,
    //                                never bytes)
    //   Location / StorageLocation   physical/storage topology
    //   Models_Serving.EndpointPort  network topology
    //   Rotation (spaces/placements) visual-only, meaningless off-box
    //
    // The envelope's SourceHost is the machine NAME, never a hostname.
    // Command results flowing back up obey the same rule: ids, entity Names
    // and values that arrived in the command payload — nothing else.
    //
    // Belt-and-braces beyond the field allowlist: the serialized payload is
    // scrubbed of RFC1918 IP literals before it leaves the machine
    // (Service_Lab_CloudSyncPush.ScrubPrivateIps) — an allowlist cannot stop
    // an address typed into an allowed free-text field.
    //
    // The cloud half is JunctionRelay_Cloud: Models/Model_LabSnapshot.cs.
    // KEEP THE TWO IN LOCKSTEP and bump SchemaVersion on any change — the
    // cloud refuses snapshots newer than it understands, so a version bump
    // deploys cloud-first.
    // ============================================================================

    public class Model_Lab_SyncSnapshot
    {
        // v6: Shared - what the user chose to share, per category and feature
        // (Model_Lab_CloudShare); whatever is not shared travels empty, so the cloud says
        // "not shared" instead of "none". Benchmark results travel when shared (without
        // ConfigJson, which is free-form). Fit verdicts still never leave.
        //
        // v5: a reference score carries WHAT MAKES IT COMPARABLE as
        // fields - provenance, evaluated precision, scaffold, context. They were a
        // sentence in Notes, which never leaves the box, so a remote agent could not
        // tell a vendor's own claim from an independently-run figure.
        //
        // v4: a SERVING assignment carries the setup it actually
        // serves. Without it a remote agent read a slot and took the quant from
        // the catalog entry, which is a CHECKPOINT listing every quant owned of
        // it - so the daily driver appeared to serve six quants at once.
        //
        // v3: a benchmark names its model as TEXT and carries the
        // setup it was measured under as fields; the catalog carries the quants
        // actually held; reference scores and fit verdicts sync at all - without
        // them a remote agent sees a model's speed but not what it scores or
        // where it refuses to load, which is half the discussion.
        public const int CurrentSchemaVersion = 6;

        public int SchemaVersion { get; set; } = CurrentSchemaVersion;
        public DateTime GeneratedAt { get; set; }
        public string? SourceHost { get; set; }          // machine NAME only
        public SyncShared Shared { get; set; } = new();

        public SyncLab Lab { get; set; } = new();
        public SyncModels Models { get; set; } = new();
    }

    // v6: the share choices themselves (the same flags as Model_Lab_CloudShare) - KEEP IN LOCKSTEP
    // with JunctionRelay_Cloud SyncShared.
    public class SyncShared
    {
        public HomelabShared Homelab { get; set; } = new();
        public ModelsShared Models { get; set; } = new();
        public class HomelabShared
        {
            public bool Enabled { get; set; }
            public bool Movements { get; set; }
            public bool Purchases { get; set; }
            public bool Spaces { get; set; }
            public bool Attachments { get; set; }
        }
        public class ModelsShared
        {
            public bool Enabled { get; set; }
            public bool Serving { get; set; }
            public bool Scores { get; set; }
            public bool Benchmarks { get; set; }
        }
    }

    public class SyncLab
    {
        public List<SyncLabMachine> Machines { get; set; } = new();
        public List<SyncLabComponent> Components { get; set; } = new();
        public List<SyncLabComponentMovement> Movements { get; set; } = new();
        public List<SyncLabComponentType> ComponentTypes { get; set; } = new();
        public List<SyncLabSpace> Spaces { get; set; } = new();
        public List<SyncLabPlacement> Placements { get; set; } = new();
        public List<SyncLabAttachment> Attachments { get; set; } = new();
        public List<SyncLabMarketValue> MarketValues { get; set; } = new();
        public List<SyncLabMachineGroup> MachineGroups { get; set; } = new();
    }

    public class SyncModels
    {
        public List<SyncModelsCatalogEntry> Catalog { get; set; } = new();
        public List<SyncModelsServingAssignment> Serving { get; set; } = new();
        public List<SyncModelsBenchmark> Benchmarks { get; set; } = new();
        public List<SyncModelsReferenceScore> ReferenceScores { get; set; } = new();
        public List<SyncModelsFitVerdict> FitVerdicts { get; set; } = new();
    }

    public class SyncLabMachine
    {
        public int Id { get; set; }                      // local id — cloud scopes by user
        public string Name { get; set; } = string.Empty; // identity: how the user names the box
        public string? Kind { get; set; }                // form factor, not topology
        public string? Role { get; set; }                // what it is for
        public string Status { get; set; } = "active";
        public string? OS { get; set; }                  // product name, not configuration
        public bool AlwaysOn { get; set; }
        public int? LinkedDeviceId { get; set; }         // soft ref into the same user's data
        public DateTime? CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public class SyncLabComponent
    {
        public int Id { get; set; }
        public string Type { get; set; } = string.Empty;
        public string? Name { get; set; }
        public string? Manufacturer { get; set; }        // public product facts
        public string? Model { get; set; }
        public string? Nickname { get; set; }
        public string? Sku { get; set; }                 // a catalog number, not a serial
        public string? Spec { get; set; }                // the short spec line ("32GB DDR5-6000")
        public string Status { get; set; } = "active";
        public int? CurrentMachineId { get; set; }
        public int? ParentComponentId { get; set; }
        public string? ReleaseDate { get; set; }
        public double? Msrp { get; set; }                // pricing: the module's whole point,
        public double? ListPrice { get; set; }           // and what the cloud MCP answers about
        public string? ListPriceDate { get; set; }
        public double? PurchasePrice { get; set; }
        public DateTime? AcquiredAt { get; set; }
        public string? Source { get; set; }              // where bought — a store name
        public string? Vendor { get; set; }
        public int? WarrantyYears { get; set; }
        public DateTime? CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public class SyncLabComponentMovement
    {
        public int Id { get; set; }
        public int ComponentId { get; set; }
        public int? FromMachineId { get; set; }
        public int? ToMachineId { get; set; }
        public string? SlotLabel { get; set; }           // "PCIe x16 #1" — machine geometry
        public DateTime MovedAt { get; set; }
        public DateTime? CreatedAt { get; set; }
    }

    public class SyncLabComponentType
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Label { get; set; }
        public int SortOrder { get; set; }
        public string Status { get; set; } = "active";
        public string? Icon { get; set; }
        // The FORM SCHEMA (field definitions), not user data — the cloud needs
        // it to label inventory columns the way the local UI does.
        public string? FieldsJson { get; set; }
    }

    public class SyncLabSpace
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Kind { get; set; }
        public int? ComponentId { get; set; }
        public int? ParentSpaceId { get; set; }
        public int? HeightU { get; set; }
        public double? WidthInches { get; set; }
        public double? DepthInches { get; set; }
        public string Status { get; set; } = "active";
        public int SortOrder { get; set; }
        public DateTime? CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public class SyncLabPlacement
    {
        public int Id { get; set; }
        public int SpaceId { get; set; }
        public int? MachineId { get; set; }
        public int? ComponentId { get; set; }
        public int? PositionU { get; set; }
        public int? HeightU { get; set; }
        public string? Face { get; set; }
        public string Status { get; set; } = "installed";
        public DateTime? CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public class SyncLabAttachment
    {
        public int Id { get; set; }
        public int? ComponentId { get; set; }
        public int? MachineId { get; set; }
        public string Kind { get; set; } = "Other";
        public string? FileName { get; set; }            // the original name, the human identifier
        public string? ContentType { get; set; }
        public long SizeBytes { get; set; }
        public string? Sha256 { get; set; }              // content hash — the future blob-sync key
        public DateTime? CreatedAt { get; set; }
    }

    public class SyncLabMarketValue
    {
        public int Id { get; set; }
        public int ComponentId { get; set; }
        public double Value { get; set; }
        public string? Condition { get; set; }
        public string? Source { get; set; }
        public string? SourceUrl { get; set; }           // the citation — an external listing URL
        public DateTime CapturedAt { get; set; }
        public DateTime? CreatedAt { get; set; }
    }

    public class SyncLabMachineGroup
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Field { get; set; }
        public string? RolesJson { get; set; }           // matched values, not free text
        public int SortOrder { get; set; }
        public DateTime? CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public class SyncModelsCatalogEntry
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Family { get; set; }
        public double? ParamsB { get; set; }

        // Contract v4: Dense | MoE | Hybrid, and a MoE's active params per
        // token - the property that predicts how a model serves. Nullable so older
        // servers' payloads still deserialize.
        public string? Architecture { get; set; }
        public double? ActiveParamsB { get; set; }

        public string? Quant { get; set; }

        // Contract v3: the quants actually held, each with its own
        // measured size - [{"quant":"UD-Q4_K_XL","sizeGb":17.92}, ...]. Without
        // it SizeGb reads as one number for a shelf entry that is really several
        // files, and a remote agent cannot tell which of them you own.
        public string? QuantsJson { get; set; }

        public int? ContextLength { get; set; }
        public string? KvCachePrecision { get; set; }
        public double? SizeGb { get; set; }
        public string? TraitsJson { get; set; }          // deciding traits, a curated list

        // The workload class the entry is judged within - a speed only means
        // something inside its use case.
        public string? Category { get; set; }
        public string Status { get; set; } = "active";
        public int? SupersededById { get; set; }
        public DateTime? CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public class SyncModelsServingAssignment
    {
        public int Id { get; set; }
        public int ModelId { get; set; }
        public int? MachineId { get; set; }
        public string? Alias { get; set; }
        public string Mode { get; set; } = "on-demand";
        public bool IsDefault { get; set; }
        public string Status { get; set; } = "active";
        // v4: what the slot ACTUALLY serves. Without these a cloud agent read a
        // serving row and had to borrow the quant from the catalog entry - which
        // is a CHECKPOINT and lists every quant owned of it, so the daily driver
        // appeared to serve six quants at once.
        public string? Quant { get; set; }
        public int? ContextTokens { get; set; }
        public int? Slots { get; set; }
        public string? KvPrecision { get; set; }
        public bool? Mtp { get; set; }
        public bool? Vision { get; set; }
        public double? WeightsGb { get; set; }
        public DateTime? CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    // excluded: Notes (house rule: notes never leave the box)
    public class SyncModelsBenchmark
    {
        public int Id { get; set; }

        // The measured model by NAME; the catalog link is optional, because a
        // benchmark may name a model the sender never catalogued.
        public string ModelName { get; set; } = string.Empty;
        public int? ModelId { get; set; }
        public int? MachineId { get; set; }
        public string Metric { get; set; } = string.Empty;
        public double Value { get; set; }

        // Contract v3: the setup, captured at RUN TIME. Same
        // allowlist reasoning as ConfigJson below and safe for the same reason -
        // these describe how a model was run, not who ran it or on what network.
        public string? Quant { get; set; }
        public int? ContextTokens { get; set; }
        public int? Slots { get; set; }
        public string? KvPrecision { get; set; }
        public bool? Mtp { get; set; }
        public bool? Vision { get; set; }
        public string? Engine { get; set; }
        public double? WeightsGb { get; set; }

        public DateTime CapturedAt { get; set; }
        public string? Source { get; set; }

        // Contract v2: the BENCHMARK CONTRACT's load regime.
        // A metric without its regime answers nothing remotely either.
        public string? Scenario { get; set; }

        // Contract v2: the launch configuration. Re-examined against the
        // allowlist principles and SAFE: ctx/slots/KV/offload/layers/vision/
        // engine build and the yaml display name are model-serving facts -
        // no IPs, hostnames, serials, paths or topology ride in it (v1
        // excluded it by analogy to SpecJson; the analogy was wrong - this
        // is measured product data, and it is the heart of the story the
        // cloud mirror exists to tell).
        // ConfigJson (free-form spillover) is NOT synced - like SpecJson, it can hold anything

        public DateTime? CreatedAt { get; set; }
    }

    // A PUBLISHED third-party eval figure, cited. Catalog-domain - a fact about
    // the checkpoint, never a fleet measurement, which is why it is its own list.
    // excluded: Notes (free text, house rule)
    public class SyncModelsReferenceScore
    {
        public int Id { get; set; }
        public int ModelId { get; set; }
        public string Benchmark { get; set; } = string.Empty;
        public double Score { get; set; }
        public string Source { get; set; } = string.Empty;   // the citation URL
        // v5: what makes the score comparable. These were a sentence inside Notes,
        // which the contract excludes - so a remote agent saw "73.4" with no idea it
        // was a vendor's own number at BF16 on their own scaffold. Bounded values,
        // not free text, so they can safely leave the box.
        public string? Provenance { get; set; }
        public string? EvaluatedPrecision { get; set; }
        public string? Scaffold { get; set; }
        public int? EvaluatedContextTokens { get; set; }
        public DateTime CapturedAt { get; set; }
    }

    // 'This exact setup cannot serve on this machine' - a measurement of refusal.
    // The FACT of the refusal and the setup attempted sync; the verdict is what a
    // remote agent needs to stop recommending a setup that cannot run.
    //
    // ⛔ Reason does NOT leave the box. It is the engine's own load error, copied
    // verbatim from the box's logs, and those routinely carry absolute model paths
    // - storage topology, which the allowlist excludes everywhere. Read it locally.
    public class SyncModelsFitVerdict
    {
        public int Id { get; set; }
        public int ModelId { get; set; }
        public int MachineId { get; set; }
        public string ConfigJson { get; set; } = string.Empty;
        public DateTime CapturedAt { get; set; }
    }
}
