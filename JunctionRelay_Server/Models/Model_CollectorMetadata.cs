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
    public class Model_CollectorMetadata
    {
        public required string CollectorName { get; set; }
        public required string DisplayName { get; set; }
        public required string Description { get; set; }
        public required string Category { get; set; }
        public required string Emoji { get; set; }
        public Model_CollectorFieldRequirements Fields { get; set; } = new();
        public Model_CollectorDefaults Defaults { get; set; } = new();
        public List<Model_SetupStep> SetupInstructions { get; set; } = new();
        public string? SetupNote { get; set; }
        public bool SupportsPersistentSession { get; set; }
        public bool RequiresService { get; set; }
        public string? RequiredServiceType { get; set; }

        // Provenance fields — stamped by registry/plugin manager, not by individual collectors
        public required string Source { get; set; }  // "native" | "bundled" | "user"
        public string? Version { get; set; }       // e.g. "1.0.0" (plugins only)
        public string? PackageName { get; set; }   // npm package name (plugins only)
        public string? AuthorName { get; set; }
        public string? AuthorUrl { get; set; }
    }

    public class Model_CollectorFieldRequirements
    {
        public bool RequiresUrl { get; set; }
        public bool RequiresAccessToken { get; set; }
        public string? UrlLabel { get; set; }
        public string? UrlPlaceholder { get; set; }
        public string? AccessTokenLabel { get; set; }
        public string? AccessTokenPlaceholder { get; set; }
        public string? UrlValidationPattern { get; set; }
        public string? AccessTokenValidationPattern { get; set; }
    }

    public class Model_CollectorDefaults
    {
        public string? Name { get; set; }
        public string? Url { get; set; }
        public int? PollRate { get; set; }
        public int? SendRate { get; set; }
    }

    public class Model_SetupStep
    {
        public required string Title { get; set; }
        public required string Body { get; set; }
    }
}
