using System.Threading.Tasks;

namespace JunctionRelayServer.Utils
{
    public class StartupSignals
    {
        public TaskCompletionSource<bool> DatabaseInitialized { get; } = new();
    }
}
