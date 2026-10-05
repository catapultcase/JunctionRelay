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

using JunctionRelayServer.Models;
using JunctionRelayServer.Services;
using Microsoft.AspNetCore.Mvc;

namespace JunctionRelayServer.Controllers
{
    // Models module (MODELS) — the weights catalog.
    [ApiController]
    [Route("api/models/catalog")]
    public class Controller_Models_Catalog : ControllerBase
    {
        private static readonly string[] ValidStatuses = { "active", "archived", "superseded" };

        private readonly Service_Database_Manager_Models_Catalog _catalogDb;

        public Controller_Models_Catalog(Service_Database_Manager_Models_Catalog catalogDb)
        {
            _catalogDb = catalogDb;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] bool includeRetired = true)
        {
            try
            {
                return Ok(await _catalogDb.GetAllAsync(includeRetired));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_CATALOG] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching catalog: {ex.Message}");
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            try
            {
                var entry = await _catalogDb.GetByIdAsync(id);
                if (entry == null) return NotFound($"No catalog entry with id {id}.");
                return Ok(entry);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_CATALOG] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching catalog entry: {ex.Message}");
            }
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] Model_Models_CatalogEntry entry)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(entry.Name))
                    return BadRequest("Name is required.");
                if (!string.IsNullOrWhiteSpace(entry.Status) && !ValidStatuses.Contains(entry.Status))
                    return BadRequest($"Status must be one of: {string.Join(", ", ValidStatuses)}.");

                var id = await _catalogDb.CreateAsync(entry);
                return Ok(await _catalogDb.GetByIdAsync(id));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_CATALOG] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error creating catalog entry: {ex.Message}");
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(int id, [FromBody] Model_Models_CatalogEntry entry)
        {
            try
            {
                var existing = await _catalogDb.GetByIdAsync(id);
                if (existing == null) return NotFound($"No catalog entry with id {id}.");
                if (string.IsNullOrWhiteSpace(entry.Name))
                    return BadRequest("Name is required.");
                if (!string.IsNullOrWhiteSpace(entry.Status) && !ValidStatuses.Contains(entry.Status))
                    return BadRequest($"Status must be one of: {string.Join(", ", ValidStatuses)}.");
                if (entry.SupersededById == id)
                    return BadRequest("An entry cannot supersede itself.");

                entry.Id = id;
                await _catalogDb.UpdateAsync(entry);
                return Ok(await _catalogDb.GetByIdAsync(id));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_CATALOG] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error updating catalog entry: {ex.Message}");
            }
        }

        // Typo rows only — a model that stopped mattering is archived or superseded.
        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            try
            {
                var existing = await _catalogDb.GetByIdAsync(id);
                if (existing == null) return NotFound($"No catalog entry with id {id}.");

                var deleted = await _catalogDb.DeleteAsync(id);
                if (!deleted)
                    return Conflict("Entry is referenced by serving assignments, benchmarks or a supersession chain. Archive it instead.");
                return Ok(new { deleted = true });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_CATALOG] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error deleting catalog entry: {ex.Message}");
            }
        }
    }
}
