/** One layout downloaded from FrameXchange, as GET /api/frameengine/downloaded-layouts returns it. */
export interface DownloadedLayout {
    path: string;
    name: string;
    isTemplate: boolean;
    hasThumbnail: boolean;
    source: "subscribed";
    fileSize: number;
    authorName?: string | null;
    authorUrl?: string | null;
    authorId?: string | null;
    authorAvatarUrl?: string | null;
    subscription: {
        id: number;
        serverUrl: string;
        autoUpdate: boolean;
    };
}
