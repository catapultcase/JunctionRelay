using JunctionRelayServer.Models;
using JunctionRelayServer.Utils;
using System.Collections.Generic;
using System.Linq;

namespace JunctionRelayServer.Extensions
{
    public static class CollectorExtensions
    {
        public static Model_CollectorResponse ToResponse(this Model_Collector model)
        {
            var hasAccessToken = !string.IsNullOrEmpty(model.AccessToken);
            var accessTokenStatus = CollectorAccessTokenHelper.GetAccessTokenStatus(
                model.CollectorType,
                hasAccessToken
            );

            return new Model_CollectorResponse
            {
                Id = model.Id,
                Name = model.Name,
                CollectorType = model.CollectorType,
                Status = model.Status,
                SecurityStatus = model.SecurityStatus,
                Description = model.Description,
                URL = model.URL,
                ExternalAccessToken = model.ExternalAccessToken,
                PollRate = model.PollRate,
                SendRate = model.SendRate,
                ServiceId = model.ServiceId,
                AccessToken = hasAccessToken ? "********" : null,
                AccessTokenStatus = accessTokenStatus,
                LastTested = model.LastTested,
                TestFrequency = model.TestFrequency,
                LastFetchErrorMessage = model.LastFetchErrorMessage
            };
        }

        public static IEnumerable<Model_CollectorResponse> ToResponseList(this IEnumerable<Model_Collector> models)
        {
            return models.Select(m => m.ToResponse());
        }
    }
}
