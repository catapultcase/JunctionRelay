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

using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Services;
using JunctionRelayServer.Services.PayloadPlugins;
using JunctionRelayServer.Services.ElementPlugins;

namespace JunctionRelayServer.Controllers
{
    [Route("api/protocols")]
    [ApiController]
    public class Controller_Protocols : ControllerBase
    {
        private readonly Service_PayloadMetadataRegistry _metadataRegistry;
        private readonly Service_PayloadPluginManager _pluginManager;

        public Controller_Protocols(
            Service_PayloadMetadataRegistry metadataRegistry,
            Service_PayloadPluginManager pluginManager)
        {
            _metadataRegistry = metadataRegistry;
            _pluginManager = pluginManager;
        }

        // GET /api/protocols/types — returns metadata for all payload plugin types
        [HttpGet("types")]
        public IActionResult GetProtocolTypes()
        {
            return Ok(_metadataRegistry.GetAll());
        }

        // GET /api/protocols/types/{name} — returns metadata for a single payload plugin type
        [HttpGet("types/{name}")]
        public IActionResult GetProtocolTypeByName(string name)
        {
            var metadata = _metadataRegistry.GetByName(name);
            if (metadata == null) return NotFound(new { error = $"Protocol type '{name}' not found" });
            return Ok(metadata);
        }

        // POST /api/protocols/install — upload and install a zipped payload plugin
        [HttpPost("install")]
        public async Task<IActionResult> InstallProtocolPlugin(IFormFile protocolFile)
        {
            try
            {
                if (protocolFile == null || protocolFile.Length == 0)
                    return BadRequest(new { error = "No file provided" });

                if (!protocolFile.FileName.ToLowerInvariant().EndsWith(".zip"))
                    return BadRequest(new { error = "File must be a ZIP package" });

                if (protocolFile.Length > 20 * 1024 * 1024)
                    return BadRequest(new { error = "File size exceeds 20MB limit" });

                var protocolsDir = _pluginManager.UserDirectory;
                Directory.CreateDirectory(protocolsDir);

                var destPath = Path.Combine(protocolsDir, protocolFile.FileName);
                using (var stream = new FileStream(destPath, FileMode.Create))
                {
                    await protocolFile.CopyToAsync(stream);
                }

                Service_PluginZipInstaller.ExtractPendingZips(protocolsDir);

                await _pluginManager.DiscoverAndCacheMetadataAsync();
                _metadataRegistry.Rebuild();

                return Ok(_metadataRegistry.GetAll());
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Error installing protocol plugin: {ex.Message}" });
            }
        }
    }
}
