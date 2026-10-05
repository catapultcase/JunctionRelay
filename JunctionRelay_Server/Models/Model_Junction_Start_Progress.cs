namespace JunctionRelayServer.Models;

public class Model_Junction_Start_Progress
{
    public int JunctionId { get; set; }
    public string JunctionName { get; set; } = string.Empty;
    public string OperationId { get; set; } = string.Empty;
    public JunctionStartStage Stage { get; set; }
    public string DetailMessage { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
    public bool IsComplete { get; set; }
    public bool HasError { get; set; }
    public string? ErrorMessage { get; set; }
}

public enum JunctionStartStage
{
    Validating = 1,
    LoadingConfiguration = 2,
    TestingCollectors = 3,
    RegisteringSources = 4,
    ConfiguringGateway = 5,
    StartingStreams = 6,
    Complete = 7
}

public static class JunctionStartStageExtensions
{
    public static string ToDisplayName(this JunctionStartStage stage)
    {
        return stage switch
        {
            JunctionStartStage.Validating => "Validating",
            JunctionStartStage.LoadingConfiguration => "Loading Configuration",
            JunctionStartStage.TestingCollectors => "Testing Collectors",
            JunctionStartStage.RegisteringSources => "Registering Sources",
            JunctionStartStage.ConfiguringGateway => "Configuring Gateway",
            JunctionStartStage.StartingStreams => "Starting Streams",
            JunctionStartStage.Complete => "Complete",
            _ => "Unknown"
        };
    }

    public static int GetStepNumber(this JunctionStartStage stage)
    {
        return (int)stage;
    }

    public static int GetTotalSteps(bool isGatewayJunction)
    {
        return isGatewayJunction ? 7 : 6; // Gateway has extra step
    }
}
