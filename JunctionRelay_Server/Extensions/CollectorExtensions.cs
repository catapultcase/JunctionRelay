using JunctionRelayServer.Models;
using System.Collections.Generic;
using System.Linq;

namespace JunctionRelayServer.Extensions
{
    public static class CollectorExtensions
    {
        public static Model_CollectorResponse ToResponse(this Model_Collector model)
        {
            return new Model_CollectorResponse
            {
                Id = model.Id,
                Name = model.Name,
                CollectorType = model.CollectorType,
                Status = model.Status,
                Description = model.Description,
                URL = model.URL,
                ExternalAccessToken = model.ExternalAccessToken,
                PollRate = model.PollRate,
                SendRate = model.SendRate,
                ServiceId = model.ServiceId
            };
        }

        public static IEnumerable<Model_CollectorResponse> ToResponseList(this IEnumerable<Model_Collector> models)
        {
            return models.Select(m => m.ToResponse());
        }
    }
}
