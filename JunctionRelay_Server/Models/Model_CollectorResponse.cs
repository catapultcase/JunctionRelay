namespace JunctionRelayServer.Models
{
    public class Model_CollectorResponse
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public string CollectorType { get; set; } = "";
        public string Status { get; set; } = "";
        public string SecurityStatus { get; set; } = "Unlocked";
        public string? Description { get; set; }
        public string? URL { get; set; }
        public bool ExternalAccessToken { get; set; }
        public int? PollRate { get; set; }
        public int? SendRate { get; set; }
        public int? ServiceId { get; set; }

        // Access token info
        public string? AccessToken { get; set; }
        public string AccessTokenStatus { get; set; } = "";

        // Testing info
        public DateTime? LastTested { get; set; }
        public int? TestFrequency { get; set; }

        // Error tracking
        public string? LastFetchErrorMessage { get; set; }
    }
}
