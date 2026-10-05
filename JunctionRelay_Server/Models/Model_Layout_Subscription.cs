/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * JunctionRelay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * JunctionRelay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with JunctionRelay. If not, see <https://www.gnu.org/licenses/>.
 */

namespace JunctionRelayServer.Models
{
    /// <summary>
    /// Tracks subscriptions to layouts from cloud (FrameXchange) or remote JunctionRelay servers.
    /// Matches XSD's Layout_Subscriptions schema for shared UI compatibility.
    /// </summary>
    public class Model_Layout_Subscription
    {
        public int Id { get; set; }

        /// <summary>'cloud' for FrameXchange, hostname/IP for remote server, 'local' for manual imports</summary>
        public string ServerUrl { get; set; } = string.Empty;

        /// <summary>Port of the remote server, '0' for cloud/manual</summary>
        public string ServerPort { get; set; } = "0";

        /// <summary>User-friendly name for the remote server</summary>
        public string? ServerName { get; set; }

        /// <summary>Layout ID on the remote source (template ID for cloud, layout ID for server)</summary>
        public string RemoteLayoutId { get; set; } = string.Empty;

        /// <summary>Display name of the remote layout</summary>
        public string RemoteLayoutName { get; set; } = string.Empty;

        /// <summary>Cloud variant ID for re-downloading the correct variant</summary>
        public string? RemoteVariantId { get; set; }

        /// <summary>Absolute path to the local ZIP file</summary>
        public string LocalFilePath { get; set; } = string.Empty;

        /// <summary>Filename of the local ZIP (basename)</summary>
        public string LocalFileName { get; set; } = string.Empty;

        /// <summary>When the ZIP was last downloaded/updated</summary>
        public string? LastDownloadedAt { get; set; }

        /// <summary>Version marker from remote source (lastModified for servers, currentVersionId for cloud)</summary>
        public string? RemoteLastModified { get; set; }

        /// <summary>When the subscription was created</summary>
        public string SubscribedAt { get; set; } = DateTime.UtcNow.ToString("o");

        /// <summary>Whether the subscription is active</summary>
        public int IsActive { get; set; } = 1;

        /// <summary>Whether to auto-update when changes are detected</summary>
        public int AutoUpdate { get; set; } = 1;

        /// <summary>Whether the source layout is a template</summary>
        public int IsTemplate { get; set; } = 0;

        /// <summary>Source type: 'cloud', 'server', or 'manual'</summary>
        public string Source { get; set; } = "manual";

        /// <summary>Whether a thumbnail has been extracted from the ZIP</summary>
        public int HasThumbnail { get; set; } = 0;

        /// <summary>Relative path to the extracted thumbnail (e.g. "frameengine/thumbnails/sub_3.png")</summary>
        public string? ThumbnailPath { get; set; }

        /// <summary>Image format of the thumbnail (e.g. "png", "jpg", "webp")</summary>
        public string? ThumbnailFormat { get; set; }

        /// <summary>Display name of the author (from Clerk profile or plugin manifest)</summary>
        public string? AuthorName { get; set; }

        /// <summary>Author homepage URL (from plugin manifest)</summary>
        public string? AuthorUrl { get; set; }

        /// <summary>Clerk user ID of the author (cloud subscriptions only)</summary>
        public string? AuthorId { get; set; }

        /// <summary>Avatar URL of the author (cloud subscriptions only)</summary>
        public string? AuthorAvatarUrl { get; set; }
    }
}
