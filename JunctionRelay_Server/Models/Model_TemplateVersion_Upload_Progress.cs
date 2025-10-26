using System;

namespace JunctionRelayServer.Models
{
    /// <summary>
    /// Stages for template version upload process
    /// </summary>
    public enum TemplateVersionUploadStage
    {
        Preparing = 1,
        HashingAssets = 2,
        CheckingCloud = 3,
        UploadingAssets = 4,
        SavingMetadata = 5,
        Complete = 6
    }

    /// <summary>
    /// Progress information for a template version upload operation
    /// </summary>
    public class Model_TemplateVersion_Upload_Progress
    {
        public int TemplateId { get; set; }
        public string TemplateName { get; set; } = string.Empty;
        public string OperationId { get; set; } = string.Empty;
        public TemplateVersionUploadStage Stage { get; set; }
        public string DetailMessage { get; set; } = string.Empty;
        public int ProgressPercentage { get; set; } // 0-100
        public DateTime Timestamp { get; set; }
        public bool IsComplete { get; set; }
        public bool HasError { get; set; }
        public string? ErrorMessage { get; set; }
    }
}
