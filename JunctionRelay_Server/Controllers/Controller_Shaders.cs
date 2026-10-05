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
using JunctionRelayServer.Models;
using JunctionRelayServer.Services.ShaderPlugins;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/shaders")]
    public class Controller_Shaders : ControllerBase
    {
        private readonly Service_ShaderPluginRegistry _registry;

        public Controller_Shaders(Service_ShaderPluginRegistry registry)
        {
            _registry = registry;
        }

        /// <summary>
        /// Returns all registered shader definitions.
        /// The frontend uses this to populate the shader picker dropdown.
        /// </summary>
        [HttpGet]
        public ActionResult<List<ShaderDefinition>> GetShaders()
        {
            return Ok(_registry.GetAll());
        }

        /// <summary>
        /// Returns a specific shader definition by its shaderName.
        /// </summary>
        [HttpGet("{shaderName}")]
        public ActionResult<ShaderDefinition> GetShader(string shaderName)
        {
            var definition = _registry.GetByShaderName(shaderName);
            if (definition == null)
                return NotFound(new { error = $"Shader '{shaderName}' not found" });

            return Ok(definition);
        }
    }
}
