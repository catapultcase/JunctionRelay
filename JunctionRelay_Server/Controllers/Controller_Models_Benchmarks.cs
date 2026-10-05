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
    // Models module (MODELS) — the measurement ledger. Append-only: record and
    // read; delete exists only for rows that were wrong at entry.
    [ApiController]
    [Route("api/models/benchmarks")]
    public class Controller_Models_Benchmarks : ControllerBase
    {
        private readonly Service_Database_Manager_Models_Benchmarks _benchmarksDb;
        private readonly Service_Database_Manager_Models_Catalog _catalogDb;

        public Controller_Models_Benchmarks(
            Service_Database_Manager_Models_Benchmarks benchmarksDb,
            Service_Database_Manager_Models_Catalog catalogDb)
        {
            _benchmarksDb = benchmarksDb;
            _catalogDb = catalogDb;
        }

        // Recent measurements across all models, newest first — the Benchmarks tab feed.
        [HttpGet("recent")]
        public async Task<IActionResult> GetRecent([FromQuery] int limit = 200)
        {
            try
            {
                if (limit < 1) limit = 1;
                if (limit > 50000) limit = 50000;   // the matrix reads the whole ledger; a day of suite runs is 500+ rows
                return Ok(await _benchmarksDb.GetRecentAsync(limit));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_BENCHMARKS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching benchmarks: {ex.Message}");
            }
        }

        [HttpGet("model/{modelId}")]
        public async Task<IActionResult> GetForModel(int modelId)
        {
            try
            {
                return Ok(await _benchmarksDb.GetForModelAsync(modelId));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_BENCHMARKS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching benchmarks: {ex.Message}");
            }
        }

        [HttpPost]
        public async Task<IActionResult> Record([FromBody] Model_Models_Benchmark benchmark)
        {
            try
            {
                // ModelName is the row's identity; a catalog link is optional, so
                // a model that is not on the shelf can still be benchmarked.
                if (string.IsNullOrWhiteSpace(benchmark.ModelName))
                    return BadRequest("ModelName is required.");
                if (string.IsNullOrWhiteSpace(benchmark.Metric))
                    return BadRequest("Metric is required.");
                if (benchmark.ModelId != null && await _catalogDb.GetByIdAsync(benchmark.ModelId.Value) == null)
                    return BadRequest($"No catalog entry with id {benchmark.ModelId}.");

                var id = await _benchmarksDb.RecordAsync(benchmark);
                return Ok(new { id });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_BENCHMARKS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error recording benchmark: {ex.Message}");
            }
        }

        // For rows that were WRONG at entry — never for numbers that went stale.
        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            try
            {
                var deleted = await _benchmarksDb.DeleteAsync(id);
                if (!deleted) return NotFound($"No benchmark with id {id}.");
                return Ok(new { deleted = true });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_BENCHMARKS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error deleting benchmark: {ex.Message}");
            }
        }
    }
}
