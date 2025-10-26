using System.Threading.Tasks;

namespace JunctionRelayServer.Utils
{
    public class StartupSignals
    {
        public TaskCompletionSource<bool> DatabaseInitialized { get; } = new();
        public TaskCompletionSource<bool> EventEngineInitialized { get; } = new();
        public TaskCompletionSource<bool> CollectorTestingComplete { get; } = new();
    }
}
