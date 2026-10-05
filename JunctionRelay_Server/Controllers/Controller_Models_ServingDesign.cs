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
    // Models module (MODELS) - the serving page's design elements, editable from the page itself.
    [ApiController]
    [Route("api/models/serving-design")]
    public class Controller_Models_ServingDesign : ControllerBase
    {
        private static readonly string[] Kinds = { "box", "client", "rule" };
        private readonly Service_Database_Manager_Models_ServingDesign _db;
        public Controller_Models_ServingDesign(Service_Database_Manager_Models_ServingDesign db)
        { _db = db; }

        private ObjectResult Fail(string what, Exception ex)
        {
            Console.WriteLine($"[MODELS_SERVING_DESIGN] {what} failed: {ex.Message}");
            return StatusCode(500, $"Error {what}: {ex.Message}");
        }

        private static string? Invalid(Model_Models_ServingDesign e) =>
            !Kinds.Contains(e.Kind) ? "Kind must be box, client or rule."
            : e.Kind != "rule" && string.IsNullOrWhiteSpace(e.Name) ? "A box or client needs a Name."
            : e.Kind == "rule" && string.IsNullOrWhiteSpace(e.Body) ? "A rule needs a Body."
            : null;

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            try { return Ok(await _db.GetAllAsync()); }
            catch (Exception ex) { return Fail("fetching the serving design", ex); }
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] Model_Models_ServingDesign e)
        {
            try
            {
                if (Invalid(e) is string why) return BadRequest(why);
                var id = await _db.CreateAsync(e);
                return Ok(await _db.GetByIdAsync(id));
            }
            catch (Exception ex) { return Fail("creating a serving design element", ex); }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(int id, [FromBody] Model_Models_ServingDesign e)
        {
            try
            {
                if (await _db.GetByIdAsync(id) == null) return NotFound($"No design element with id {id}.");
                e.Id = id;
                if (Invalid(e) is string why) return BadRequest(why);
                await _db.UpdateAsync(e);
                return Ok(await _db.GetByIdAsync(id));
            }
            catch (Exception ex) { return Fail("updating a serving design element", ex); }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            try { return await _db.DeleteAsync(id) ? Ok() : NotFound($"No design element with id {id}."); }
            catch (Exception ex) { return Fail("deleting a serving design element", ex); }
        }
    }
}
