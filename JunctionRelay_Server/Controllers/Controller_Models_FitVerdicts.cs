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
    // Models module (MODELS) — fit verdicts: "this exact setup cannot serve on
    // this machine", with the evidence. Not measurements; not in the ledger.
    [ApiController]
    [Route("api/models/fit-verdicts")]
    public class Controller_Models_FitVerdicts : ControllerBase
    {
        private readonly Service_Database_Manager_Models_FitVerdicts _verdictsDb;
        private readonly Service_Database_Manager_Models_Catalog _catalogDb;

        public Controller_Models_FitVerdicts(
            Service_Database_Manager_Models_FitVerdicts verdictsDb,
            Service_Database_Manager_Models_Catalog catalogDb)
        {
            _verdictsDb = verdictsDb;
            _catalogDb = catalogDb;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            try
            {
                return Ok(await _verdictsDb.GetAllAsync());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_FITVERDICTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching fit verdicts: {ex.Message}");
            }
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] Model_Models_FitVerdict verdict)
        {
            try
            {
                if (await _catalogDb.GetByIdAsync(verdict.ModelId) == null)
                    return BadRequest($"No catalog entry with id {verdict.ModelId}.");
                if (string.IsNullOrWhiteSpace(verdict.ConfigJson))
                    return BadRequest("ConfigJson is required — a verdict is about an exact setup.");
                if (string.IsNullOrWhiteSpace(verdict.Reason))
                    return BadRequest("Reason is required — a verdict without evidence is a guess.");

                var id = await _verdictsDb.CreateAsync(verdict);
                return Ok(await _verdictsDb.GetByIdAsync(id));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_FITVERDICTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error creating fit verdict: {ex.Message}");
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            try
            {
                var existing = await _verdictsDb.GetByIdAsync(id);
                if (existing == null) return NotFound($"No fit verdict with id {id}.");
                await _verdictsDb.DeleteAsync(id);
                return Ok(new { deleted = true });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MODELS_FITVERDICTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error deleting fit verdict: {ex.Message}");
            }
        }
    }
}
