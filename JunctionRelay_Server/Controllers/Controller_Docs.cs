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

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using JunctionRelayServer.Services;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [AllowAnonymous]
    public class Controller_Docs : ControllerBase
    {
        private readonly Service_Docs_Sites _docs;
        private static readonly FileExtensionContentTypeProvider _mime = new();

        public Controller_Docs(Service_Docs_Sites docs) => _docs = docs;

        public record DocsSiteInput(string Name, string Path);

        // GET: api/docs/sites — what the tab row renders.
        [HttpGet("api/docs/sites")]
        public async Task<IActionResult> GetSites()
        {
            try
            {
                var sites = await _docs.SitesAsync();
                return Ok(new
                {
                    enabled = Service_Docs_Sites.Enabled,
                    rootsVar = Service_Docs_Sites.RootsVar,
                    roots = Service_Docs_Sites.Roots(),
                    sites = sites.Select(s => new
                    {
                        id = s.Id,
                        name = s.Name,
                        path = s.Path,
                        discovered = s.Discovered,
                        url = $"/docs-content/{s.Id}/"
                    })
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DOCS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error in GetSites: {ex.Message}");
            }
        }

        // GET: api/docs/candidates — folders under the roots that look like built sites,
        // so the Configure tab can offer them rather than making you type a path.
        [HttpGet("api/docs/candidates")]
        public IActionResult GetCandidates()
        {
            try
            {
                return Ok(Service_Docs_Sites.Candidates()
                .Select(p => new { path = p, name = new DirectoryInfo(p).Name }));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DOCS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error in GetCandidates: {ex.Message}");
            }
        }

        // PUT: api/docs/sites — replace the configured list.
        [HttpPut("api/docs/sites")]
        public async Task<IActionResult> PutSites([FromBody] List<DocsSiteInput> sites)
        {
            try
            {
                if (sites is null) return BadRequest("No sites supplied.");

                var rejected = sites.Where(s => !Service_Docs_Sites.IsInsideARoot(s.Path)).ToList();
                if (rejected.Count > 0)
                    return BadRequest($"Outside {Service_Docs_Sites.RootsVar}: " +
                                      string.Join(", ", rejected.Select(r => r.Path)));

                await _docs.SaveAsync(sites.Select(s => (s.Name, s.Path)));
                return Ok(await _docs.SitesAsync());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DOCS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error in PutSites: {ex.Message}");
            }
        }

        /*
         * GET: /docs-content/{siteId}/{**path} — the site itself.
         *
         * ⚠️ Served here rather than by UseStaticFiles for two reasons. Static mounts are
         * fixed at startup, so a site added from the Configure tab would 404 until a
         * restart. And UseStaticFiles does not serve default documents: a request for a
         * DIRECTORY fell through to the SPA fallback and rendered JunctionRelay inside its
         * own iframe. MkDocs uses directory URLs for every page, so that
         * was not an edge case - it was every link on the site.
         */
        [HttpGet("docs-content/{siteId}/{**path}")]
        public async Task<IActionResult> GetContent(string siteId, string? path)
        {
            try
            {
                var site = await _docs.SiteByIdAsync(siteId);
                if (site is null) return NotFound();

                var rel = (path ?? "").Replace('\\', '/').TrimStart('/');
                if (rel.Length == 0 || rel.EndsWith('/')) rel += "index.html";

                var full = Path.GetFullPath(Path.Combine(site.Path, rel));

                // ⛔ Belt and braces: the resolved path must sit under the site AND under a root.
                var siteRoot = site.Path.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                if (!full.StartsWith(siteRoot, StringComparison.Ordinal) ||
                    !Service_Docs_Sites.IsInsideARoot(full))
                    return NotFound();

                // A directory without a trailing slash - serve its index rather than 404.
                if (Directory.Exists(full)) full = Path.Combine(full, "index.html");
                if (!System.IO.File.Exists(full)) return NotFound();

                if (!_mime.TryGetContentType(full, out var contentType))
                    contentType = "application/octet-stream";

                return PhysicalFile(full, contentType);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DOCS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error in GetContent: {ex.Message}");
            }
        }
    }
}
