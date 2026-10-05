namespace JunctionRelay.Models
{
    /// <summary>
    /// Manifest for cloud backup containing references to all frame layouts
    /// </summary>
    public class FrameManifest
    {
        public string Version { get; set; } = "2.0";
        public DateTime Timestamp { get; set; }
        public string BackendId { get; set; } = "";
        public List<TemplateFrameLayoutReference> TemplateFrameLayouts { get; set; } = new();
        public List<UserFrameLayoutReference> UserFrameLayouts { get; set; } = new();
    }

    /// <summary>
    /// Reference to a frame downloaded from FrameXchange template library
    /// </summary>
    public class TemplateFrameLayoutReference
    {
        public int LocalFrameId { get; set; }
        public string FrameName { get; set; } = "";
        public string CloudTemplateId { get; set; } = "";  // UUID from Templates.Id
        public string CloudVariantId { get; set; } = "";   // UUID from TemplateVariants.Id
    }

    /// <summary>
    /// Reference to a user-created frame layout with cloud snapshot
    /// </summary>
    public class UserFrameLayoutReference
    {
        public int LocalFrameId { get; set; }
        public string FrameName { get; set; } = "";
        public string SnapshotId { get; set; } = "";  // UUID from TemplateMetadataVersions.Id
    }
}
