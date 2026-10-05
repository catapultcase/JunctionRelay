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
    // Models module (MODELS) — reference scores: published, cited eval figures
    // for known models. Their own table; never part of the benchmark ledger.
    [ApiController]
    [Route("api/models/reference-scores")]
    public class Controller_Models_ReferenceScores : ControllerBase
    {
        private readonly Service_Database_Manager_Models_ReferenceScores _scoresDb;
        private readonly Service_Database_Manager_Models_Catalog _catalogDb;

        public Controller_Models_ReferenceScores(
            Service_Database_Manager_Models_ReferenceScores scoresDb,
            Service_Database_Manager_Models_Catalog catalogDb)
        {
            _scoresDb = scoresDb;
            _catalogDb = catalogDb;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            try
            {
                return Ok(await _scoresDb.GetAllAsync());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_REFERENCESCORES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching reference scores: {ex.Message}");
            }
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] Model_Models_ReferenceScore score)
        {
            try
            {
                if (await _catalogDb.GetByIdAsync(score.ModelId) == null)
                    return BadRequest($"No catalog entry with id {score.ModelId}.");
                if (string.IsNullOrWhiteSpace(score.Benchmark))
                    return BadRequest("Benchmark is required.");
                if (string.IsNullOrWhiteSpace(score.Source))
                    return BadRequest("Source is required — an uncited published score is a rumor.");

                var id = await _scoresDb.CreateAsync(score);
                return Ok(await _scoresDb.GetByIdAsync(id));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_REFERENCESCORES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error creating reference score: {ex.Message}");
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            try
            {
                var existing = await _scoresDb.GetByIdAsync(id);
                if (existing == null) return NotFound($"No reference score with id {id}.");
                await _scoresDb.DeleteAsync(id);
                return Ok(new { deleted = true });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_REFERENCESCORES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error deleting reference score: {ex.Message}");
            }
        }
    }
}
