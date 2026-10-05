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

using System.IO.Compression;
using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Models;
using JunctionRelayServer.Services.ElementPlugins;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/elements")]
    public class Controller_Elements : ControllerBase
    {
        private readonly Service_ElementPluginRegistry _registry;

        public Controller_Elements(Service_ElementPluginRegistry registry)
        {
            _registry = registry;
        }

        /// <summary>
        /// Returns all registered element plugin definitions.
        /// The frontend uses this to populate the Library tab palette
        /// and determine which element types have plugin renderers.
        /// </summary>
        [HttpGet("types")]
        public ActionResult<List<ElementPluginDefinition>> GetElementTypes()
        {
            return Ok(_registry.GetAll());
        }

        /// <summary>
        /// Returns a specific element plugin definition by its element name.
        /// </summary>
        [HttpGet("types/{elementName}")]
        public ActionResult<ElementPluginDefinition> GetElementType(string elementName)
        {
            var definition = _registry.GetByName(elementName);
            if (definition == null)
                return NotFound(new { error = $"Element type '{elementName}' not found" });

            return Ok(definition);
        }

        /// <summary>
        /// Upload and install a zipped element plugin.
        /// Saves the ZIP to the elements directory, extracts it, and re-discovers all plugins.
        /// </summary>
        [HttpPost("install")]
        public async Task<ActionResult<List<ElementPluginDefinition>>> InstallElementPlugin(IFormFile elementFile)
        {
            try
            {
                if (elementFile == null || elementFile.Length == 0)
                    return BadRequest(new { error = "No file provided" });

                if (!elementFile.FileName.ToLowerInvariant().EndsWith(".zip"))
                    return BadRequest(new { error = "File must be a ZIP package" });

                if (elementFile.Length > 20 * 1024 * 1024)
                    return BadRequest(new { error = "File size exceeds 20MB limit" });

                var elementsDir = _registry.ElementsDirectory;
                Directory.CreateDirectory(elementsDir);

                var destPath = Path.Combine(elementsDir, elementFile.FileName);
                using (var stream = new FileStream(destPath, FileMode.Create))
                {
                    await elementFile.CopyToAsync(stream);
                }

                Service_PluginZipInstaller.ExtractPendingZips(elementsDir);
                _registry.DiscoverAndRegister();

                return Ok(_registry.GetAll());
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Error installing element plugin: {ex.Message}" });
            }
        }
    }
}
