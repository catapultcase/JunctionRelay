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

using System.Text.Json.Serialization;

namespace JunctionRelayServer.Services.CollectorPlugins
{
    // ========================================================================
    // JSON-RPC 2.0 Wire Format
    // ========================================================================

    public class JsonRpcRequest
    {
        [JsonPropertyName("jsonrpc")]
        public string Jsonrpc { get; set; } = "2.0";

        [JsonPropertyName("method")]
        public string Method { get; set; } = "";

        [JsonPropertyName("params")]
        public object Params { get; set; } = new { };

        [JsonPropertyName("id")]
        public int Id { get; set; }
    }

    public class JsonRpcResponse
    {
        [JsonPropertyName("jsonrpc")]
        public string Jsonrpc { get; set; } = "2.0";

        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("result")]
        public System.Text.Json.JsonElement? Result { get; set; }

        [JsonPropertyName("error")]
        public JsonRpcError? Error { get; set; }
    }

    public class JsonRpcError
    {
        [JsonPropertyName("code")]
        public int Code { get; set; }

        [JsonPropertyName("message")]
        public string Message { get; set; } = "";

        [JsonPropertyName("data")]
        public object? Data { get; set; }
    }

    // ========================================================================
    // Plugin Result Types (mirrors collector-protocol TypeScript types)
    // ========================================================================

    public class PluginSensorResult
    {
        [JsonPropertyName("uniqueSensorKey")]
        public string UniqueSensorKey { get; set; } = "";

        [JsonPropertyName("name")]
        public string Name { get; set; } = "";

        [JsonPropertyName("value")]
        public string Value { get; set; } = "";

        [JsonPropertyName("unit")]
        public string Unit { get; set; } = "";

        [JsonPropertyName("category")]
        public string Category { get; set; } = "";

        [JsonPropertyName("decimalPlaces")]
        public int DecimalPlaces { get; set; }

        [JsonPropertyName("sensorType")]
        public string SensorType { get; set; } = "";

        [JsonPropertyName("componentName")]
        public string ComponentName { get; set; } = "";

        [JsonPropertyName("sensorTag")]
        public string SensorTag { get; set; } = "";
    }

    public class PluginFetchSensorsResult
    {
        [JsonPropertyName("sensors")]
        public List<PluginSensorResult> Sensors { get; set; } = new();
    }

    public class PluginConfigureResult
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }
    }

    public class PluginTestConnectionResult
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("error")]
        public string? Error { get; set; }
    }

    public class PluginHealthCheckResult
    {
        [JsonPropertyName("healthy")]
        public bool Healthy { get; set; }

        [JsonPropertyName("uptime")]
        public double Uptime { get; set; }
    }

    public class PluginSessionResult
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }
    }

    // ========================================================================
    // Plugin Metadata (mirrors CollectorMetadata from protocol)
    // ========================================================================

    public class PluginCollectorMetadata
    {
        [JsonPropertyName("collectorName")]
        public string CollectorName { get; set; } = "";

        [JsonPropertyName("displayName")]
        public string DisplayName { get; set; } = "";

        [JsonPropertyName("description")]
        public string Description { get; set; } = "";

        [JsonPropertyName("category")]
        public string Category { get; set; } = "";

        [JsonPropertyName("emoji")]
        public string Emoji { get; set; } = "";

        [JsonPropertyName("fields")]
        public PluginFieldRequirements Fields { get; set; } = new();

        [JsonPropertyName("defaults")]
        public PluginDefaults Defaults { get; set; } = new();

        [JsonPropertyName("setupInstructions")]
        public List<PluginSetupStep> SetupInstructions { get; set; } = new();

        [JsonPropertyName("setupNote")]
        public string? SetupNote { get; set; }

        [JsonPropertyName("supportsPersistentSession")]
        public bool SupportsPersistentSession { get; set; }

        [JsonPropertyName("requiresService")]
        public bool RequiresService { get; set; }

        [JsonPropertyName("requiredServiceType")]
        public string? RequiredServiceType { get; set; }

        [JsonPropertyName("authorName")]
        public string? AuthorName { get; set; }

        [JsonPropertyName("authorUrl")]
        public string? AuthorUrl { get; set; }
    }

    public class PluginFieldRequirements
    {
        [JsonPropertyName("requiresUrl")]
        public bool RequiresUrl { get; set; }

        [JsonPropertyName("requiresAccessToken")]
        public bool RequiresAccessToken { get; set; }

        [JsonPropertyName("urlLabel")]
        public string? UrlLabel { get; set; }

        [JsonPropertyName("urlPlaceholder")]
        public string? UrlPlaceholder { get; set; }

        [JsonPropertyName("accessTokenLabel")]
        public string? AccessTokenLabel { get; set; }

        [JsonPropertyName("accessTokenPlaceholder")]
        public string? AccessTokenPlaceholder { get; set; }

        [JsonPropertyName("urlValidationPattern")]
        public string? UrlValidationPattern { get; set; }

        [JsonPropertyName("accessTokenValidationPattern")]
        public string? AccessTokenValidationPattern { get; set; }
    }

    public class PluginDefaults
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("url")]
        public string? Url { get; set; }

        [JsonPropertyName("pollRate")]
        public int? PollRate { get; set; }

        [JsonPropertyName("sendRate")]
        public int? SendRate { get; set; }
    }

    public class PluginSetupStep
    {
        [JsonPropertyName("title")]
        public string Title { get; set; } = "";

        [JsonPropertyName("body")]
        public string Body { get; set; } = "";
    }

    // ========================================================================
    // Discovery
    // ========================================================================

    public class DiscoveredPlugin
    {
        public string Name { get; set; } = "";
        public string Version { get; set; } = "";
        public string Path { get; set; } = "";
        public string Entry { get; set; } = "";
        public string Source { get; set; } = "user"; // "bundled" or "user"
        /// <summary>
        /// Full metadata read from package.json at discovery time.
        /// Null if the manifest is missing required metadata fields.
        /// </summary>
        public PluginCollectorMetadata? Metadata { get; set; }
    }
}
