using JunctionRelayServer.Models;

namespace JunctionRelayServer.Extensions
{
    public static class ServiceExtensions
    {
        public static Model_ServiceResponse ToResponse(this Model_Service model)
        {
            return new Model_ServiceResponse
            {
                Id = model.Id,
                Name = model.Name,
                Description = model.Description,
                Type = model.Type,
                Status = model.Status,
                UniqueIdentifier = model.UniqueIdentifier,
                COMPort = model.COMPort,
                ServiceModel = model.ServiceModel,
                ServiceManufacturer = model.ServiceManufacturer,
                FirmwareVersion = model.FirmwareVersion,
                MCU = model.MCU,
                WirelessConnectivity = model.WirelessConnectivity,
                URL = model.URL,
                IsGateway = model.IsGateway,
                GatewayId = model.GatewayId,
                IsJunctionRelayService = model.IsJunctionRelayService,
                LastUpdated = model.LastUpdated,
                LastPolled = model.LastPolled,
                PollRate = model.PollRate,
                SendRate = model.SendRate,
                AccessToken = !string.IsNullOrEmpty(model.AccessToken) ? "********" : null,
                ExternalAccessToken = model.ExternalAccessToken,
                HasAccessToken = !string.IsNullOrEmpty(model.AccessToken),
                HomeAssistantSharedJunctions = model.HomeAssistantSharedJunctions,
                MQTTBrokerAddress = model.MQTTBrokerAddress,
                MQTTBrokerPort = model.MQTTBrokerPort,
                MQTTUsername = model.MQTTUsername,
                GrafanaSharedMetrics = model.GrafanaSharedMetrics,
                Sensors = model.Sensors,
                Peers = model.Peers,
            };
        }

        public static IEnumerable<Model_ServiceResponse> ToResponseList(this IEnumerable<Model_Service> models)
        {
            return models.Select(m => m.ToResponse());
        }
    }
}
