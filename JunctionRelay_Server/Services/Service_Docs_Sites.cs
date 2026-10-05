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

using System.Text.Json;

namespace JunctionRelayServer.Services
{
    /*
     * Documentation sites served in the Documentation tab.
     *
     * ⛔ THIS SERVER NEVER CLONES, WRITES TO, OR STORES A REPOSITORY. It serves
     * already-built static output from a read-only mount and nothing more. Keeping the
     * build elsewhere is what lets a user point this at a private repo without handing
     * over a credential.
     *
     * Two layers, and they do different jobs:
     *
     *   LAB_DOCS_ROOTS  the SECURITY boundary - which directories may ever be read.
     *                   Set by whoever runs the container; a user of the web UI cannot
     *                   widen it. Unset means the feature is off entirely.
     *
     *   docs_sites      the USER's choice of which folders under those roots appear as
     *                   tabs, stored in settings. Editable from the Configure tab.
     *
     * Same allow-list reasoning as Service_Lab_Attachment_Store: serving arbitrary paths
     * on request is how a docs viewer becomes a file-disclosure tool.
     */
    public sealed record DocsSite(string Id, string Name, string Path, bool Discovered);

    public class Service_Docs_Sites
    {
        public const string RootsVar = "LAB_DOCS_ROOTS";
        public const string SettingKey = "docs_sites";

        private readonly IService_Settings _settings;

        public Service_Docs_Sites(IService_Settings settings) => _settings = settings;

        private sealed record StoredSite(string Name, string Path);

        /// <summary>Roots from LAB_DOCS_ROOTS, colon or comma separated. Empty means the feature is off.</summary>
        public static IReadOnlyList<string> Roots() =>
            (Environment.GetEnvironmentVariable(RootsVar) ?? "")
                .Split(new[] { ':', ',' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList();

        public static bool Enabled => Roots().Count > 0;

        /*
         * ⛔ THE ONE SECURITY CHECK. Every path reaching the filesystem goes through here.
         * GetFullPath resolves ../ first, so a traversal cannot climb out of a root.
         */
        public static bool IsInsideARoot(string path)
        {
            string full;
            try { full = Path.GetFullPath(path); }
            catch { return false; }

            foreach (var root in Roots())
            {
                string r;
                try { r = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar; }
                catch { continue; }

                if (full.StartsWith(r, StringComparison.Ordinal) ||
                    full + Path.DirectorySeparatorChar == r) return true;
            }
            return false;
        }

        /// <summary>Candidate folders under the roots - anything containing index.html.</summary>
        public static IReadOnlyList<string> Candidates()
        {
            var found = new List<string>();

            foreach (var root in Roots())
            {
                string full;
                try { full = Path.GetFullPath(root); } catch { continue; }
                if (!Directory.Exists(full)) continue;

                if (File.Exists(Path.Combine(full, "index.html"))) { found.Add(full); continue; }

                foreach (var dir in Directory.EnumerateDirectories(full))
                    if (File.Exists(Path.Combine(dir, "index.html"))) found.Add(dir);
            }

            return found;
        }

        private async Task<List<StoredSite>> StoredAsync()
        {
            var raw = await _settings.GetSettingAsync(SettingKey);
            if (string.IsNullOrWhiteSpace(raw)) return new List<StoredSite>();
            try { return JsonSerializer.Deserialize<List<StoredSite>>(raw) ?? new(); }
            catch { return new List<StoredSite>(); }
        }

        /*
         * What the tab row renders.
         *
         * If the user has configured nothing, every candidate is shown - so a correctly
         * mounted site works with no setup at all. Once they configure anything, their
         * list wins, because an explicit choice must be able to EXCLUDE something.
         */
        public async Task<IReadOnlyList<DocsSite>> SitesAsync()
        {
            var stored = await StoredAsync();

            var sites = stored.Count > 0
                ? stored.Where(s => IsInsideARoot(s.Path))
                        .Select(s => new DocsSite(Slug(s.Name), s.Name, Path.GetFullPath(s.Path), false))
                : Candidates().Select(p => new DocsSite(Slug(new DirectoryInfo(p).Name),
                                                        new DirectoryInfo(p).Name, p, true));

            return sites
                .GroupBy(s => s.Id, StringComparer.OrdinalIgnoreCase)
                .Select(g => g.First())
                .OrderBy(s => s.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        public async Task<DocsSite?> SiteByIdAsync(string id) =>
            (await SitesAsync()).FirstOrDefault(s => string.Equals(s.Id, id, StringComparison.OrdinalIgnoreCase));

        public async Task SaveAsync(IEnumerable<(string Name, string Path)> sites)
        {
            // ⛔ Refuse anything outside the roots at WRITE time as well as read time, so a
            // bad entry can never be persisted and quietly retried later.
            var clean = sites
                .Where(s => !string.IsNullOrWhiteSpace(s.Name) && IsInsideARoot(s.Path))
                .Select(s => new StoredSite(s.Name.Trim(), Path.GetFullPath(s.Path)))
                .ToList();

            await _settings.SetSettingAsync(SettingKey, JsonSerializer.Serialize(clean),
                "Documentation sites shown in the Documentation tab");
        }

        // URL-safe, and never anything that could climb out of a mount.
        public static string Slug(string name)
        {
            var chars = name.Select(c => char.IsLetterOrDigit(c) ? char.ToLowerInvariant(c) : '-');
            var slug = new string(chars.ToArray()).Trim('-');
            while (slug.Contains("--")) slug = slug.Replace("--", "-");
            return slug.Length == 0 ? "site" : slug;
        }
    }
}
