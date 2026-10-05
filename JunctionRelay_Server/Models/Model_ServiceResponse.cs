namespace JunctionRelayServer.Models
{
    public class Model_ServiceResponse
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public string Type { get; set; } = "";
        public string Status { get; set; } = "";
        public string UniqueIdentifier { get; set; } = "";

        // Service info
        public string? COMPort { get; set; }
        public string? ServiceModel { get; set; }
        public string? ServiceManufacturer { get; set; }
        public string? FirmwareVersion { get; set; }
        public string? MCU { get; set; }
        public string? WirelessConnectivity { get; set; }

        // Network info
        public string? URL { get; set; }

        // Logical flags
        public bool IsGateway { get; set; }
        public int? GatewayId { get; set; }
        public bool IsJunctionRelayService { get; set; }

        // Timestamps
        public DateTime LastUpdated { get; set; }
        public DateTime? LastPolled { get; set; }

        // Polling configuration
        public int? PollRate { get; set; }
        public int? SendRate { get; set; }

        // Security — masked
        public string? AccessToken { get; set; }
        public bool ExternalAccessToken { get; set; }
        public bool HasAccessToken { get; set; }

        // HomeAssistant
        public string? HomeAssistantSharedJunctions { get; set; }

        // MQTT (non-secret metadata)
        public string? MQTTBrokerAddress { get; set; }
        public string? MQTTBrokerPort { get; set; }
        public string? MQTTUsername { get; set; }

        // Grafana
        public string? GrafanaSharedMetrics { get; set; }

        // Navigation properties
        public List<Model_Sensor> Sensors { get; set; } = new();
        public List<Model_Device> Peers { get; set; } = new();
    }
}
