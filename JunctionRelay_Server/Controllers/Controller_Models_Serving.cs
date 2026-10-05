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
    // Models module (MODELS) — serving assignments: which box holds which model.
    [ApiController]
    [Route("api/models/serving")]
    public class Controller_Models_Serving : ControllerBase
    {
        private static readonly string[] ValidModes = { "resident", "on-demand" };
        private static readonly string[] ValidStatuses = { "active", "retired" };

        private readonly Service_Database_Manager_Models_Serving _servingDb;
        private readonly Service_Database_Manager_Models_Catalog _catalogDb;

        public Controller_Models_Serving(
            Service_Database_Manager_Models_Serving servingDb,
            Service_Database_Manager_Models_Catalog catalogDb)
        {
            _servingDb = servingDb;
            _catalogDb = catalogDb;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] bool activeOnly = false)
        {
            try
            {
                return Ok(await _servingDb.GetAllAsync(activeOnly));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_SERVING] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching serving assignments: {ex.Message}");
            }
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] Model_Models_ServingAssignment assignment)
        {
            try
            {
                if (await _catalogDb.GetByIdAsync(assignment.ModelId) == null)
                    return BadRequest($"No catalog entry with id {assignment.ModelId}.");
                if (!string.IsNullOrWhiteSpace(assignment.Mode) && !ValidModes.Contains(assignment.Mode))
                    return BadRequest($"Mode must be one of: {string.Join(", ", ValidModes)}.");
                if (!string.IsNullOrWhiteSpace(assignment.Status) && !ValidStatuses.Contains(assignment.Status))
                    return BadRequest($"Status must be one of: {string.Join(", ", ValidStatuses)}.");
                var presetProblem = await _servingDb.PresetProblemAsync(assignment);
                if (presetProblem != null) return BadRequest(presetProblem);

                var id = await _servingDb.CreateAsync(assignment);
                return Ok(await _servingDb.GetByIdAsync(id));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_SERVING] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error creating serving assignment: {ex.Message}");
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(int id, [FromBody] Model_Models_ServingAssignment assignment)
        {
            try
            {
                var existing = await _servingDb.GetByIdAsync(id);
                if (existing == null) return NotFound($"No serving assignment with id {id}.");
                if (await _catalogDb.GetByIdAsync(assignment.ModelId) == null)
                    return BadRequest($"No catalog entry with id {assignment.ModelId}.");
                if (!string.IsNullOrWhiteSpace(assignment.Mode) && !ValidModes.Contains(assignment.Mode))
                    return BadRequest($"Mode must be one of: {string.Join(", ", ValidModes)}.");
                if (!string.IsNullOrWhiteSpace(assignment.Status) && !ValidStatuses.Contains(assignment.Status))
                    return BadRequest($"Status must be one of: {string.Join(", ", ValidStatuses)}.");
                assignment.Id = id;
                var presetProblem = await _servingDb.PresetProblemAsync(assignment);
                if (presetProblem != null) return BadRequest(presetProblem);

                await _servingDb.UpdateAsync(assignment);
                return Ok(await _servingDb.GetByIdAsync(id));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_SERVING] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error updating serving assignment: {ex.Message}");
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            try
            {
                var existing = await _servingDb.GetByIdAsync(id);
                if (existing == null) return NotFound($"No serving assignment with id {id}.");
                await _servingDb.DeleteAsync(id);
                return Ok(new { deleted = true });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_SERVING] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error deleting serving assignment: {ex.Message}");
            }
        }
    }
}
