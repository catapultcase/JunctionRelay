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
    [ApiController]
    [Route("api/lab/spaces")]
    public class Controller_Lab_Spaces : ControllerBase
    {
        private readonly Service_Database_Manager_Lab_Spaces _spacesDb;

        public Controller_Lab_Spaces(Service_Database_Manager_Lab_Spaces spacesDb)
        {
            _spacesDb = spacesDb;
        }

        [HttpGet]
        public async Task<IActionResult> GetSpaces([FromQuery] string? kind, [FromQuery] string? status)
        {
            try { return Ok(await _spacesDb.GetAllSpacesAsync(kind, status)); }
            catch (Exception ex) { Console.WriteLine($"[LAB_SPACES] {Request.Method} {Request.Path} failed: {ex.Message}"); return StatusCode(500, $"Error fetching spaces: {ex.Message}"); }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetSpaceById(int id)
        {
            try
            {
                var space = await _spacesDb.GetSpaceByIdAsync(id);
                return space == null ? NotFound($"No space with id {id}.") : Ok(space);
            }
            catch (Exception ex) { Console.WriteLine($"[LAB_SPACES] {Request.Method} {Request.Path} failed: {ex.Message}"); return StatusCode(500, $"Error fetching space: {ex.Message}"); }
        }

        [HttpPost]
        public async Task<IActionResult> CreateSpace([FromBody] Model_Lab_Space space)
        {
            if (string.IsNullOrWhiteSpace(space.Name)) return BadRequest("Name is required.");
            try
            {
                if (await _spacesDb.ParentProblemAsync(0, space.ParentSpaceId) is string why) return BadRequest(why);
                space.Id = await _spacesDb.CreateSpaceAsync(space);
                return CreatedAtAction(nameof(GetSpaceById), new { id = space.Id }, space);
            }
            catch (Exception ex) { Console.WriteLine($"[LAB_SPACES] {Request.Method} {Request.Path} failed: {ex.Message}"); return StatusCode(500, $"Error creating space: {ex.Message}"); }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateSpace(int id, [FromBody] Model_Lab_Space space)
        {
            if (string.IsNullOrWhiteSpace(space.Name)) return BadRequest("Name is required.");
            try
            {
                space.Id = id;
                if (await _spacesDb.ParentProblemAsync(id, space.ParentSpaceId) is string why) return BadRequest(why);
                return await _spacesDb.UpdateSpaceAsync(space)
                    ? Ok(await _spacesDb.GetSpaceByIdAsync(id))
                    : NotFound($"No space with id {id}.");
            }
            catch (Exception ex) { Console.WriteLine($"[LAB_SPACES] {Request.Method} {Request.Path} failed: {ex.Message}"); return StatusCode(500, $"Error updating space: {ex.Message}"); }
        }

        // Blocked while anything is still placed here, or while another space sits inside it.
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteSpace(int id)
        {
            try
            {
                var result = await _spacesDb.DeleteSpaceAsync(id);
                if (result == "deleted") return NoContent();
                if (result == "not found") return NotFound($"No space with id {id}.");
                return Conflict(result);
            }
            catch (Exception ex) { Console.WriteLine($"[LAB_SPACES] {Request.Method} {Request.Path} failed: {ex.Message}"); return StatusCode(500, $"Error deleting space: {ex.Message}"); }
        }

        // ------------------------------------------------------------ placements ----

        [HttpGet("placements")]
        public async Task<IActionResult> GetPlacements([FromQuery] int? spaceId)
        {
            try { return Ok(await _spacesDb.GetPlacementsAsync(spaceId)); }
            catch (Exception ex) { Console.WriteLine($"[LAB_SPACES] {Request.Method} {Request.Path} failed: {ex.Message}"); return StatusCode(500, $"Error fetching placements: {ex.Message}"); }
        }

        [HttpPost("placements")]
        public async Task<IActionResult> CreatePlacement([FromBody] Model_Lab_Placement placement)
        {
            try
            {
                var problem = await _spacesDb.ValidatePlacementAsync(placement);
                if (problem != null) return BadRequest(problem);

                placement.Id = await _spacesDb.CreatePlacementAsync(placement);
                return CreatedAtAction(nameof(GetPlacements), new { spaceId = placement.SpaceId }, placement);
            }
            catch (Exception ex) { Console.WriteLine($"[LAB_SPACES] {Request.Method} {Request.Path} failed: {ex.Message}"); return StatusCode(500, $"Error creating placement: {ex.Message}"); }
        }

        [HttpPut("placements/{id}")]
        public async Task<IActionResult> UpdatePlacement(int id, [FromBody] Model_Lab_Placement placement)
        {
            try
            {
                placement.Id = id;
                var problem = await _spacesDb.ValidatePlacementAsync(placement);
                if (problem != null) return BadRequest(problem);

                return await _spacesDb.UpdatePlacementAsync(placement)
                    ? Ok(await _spacesDb.GetPlacementByIdAsync(id))
                    : NotFound($"No placement with id {id}.");
            }
            catch (Exception ex) { Console.WriteLine($"[LAB_SPACES] {Request.Method} {Request.Path} failed: {ex.Message}"); return StatusCode(500, $"Error updating placement: {ex.Message}"); }
        }

        [HttpDelete("placements/{id}")]
        public async Task<IActionResult> DeletePlacement(int id)
        {
            try
            {
                return await _spacesDb.DeletePlacementAsync(id)
                    ? NoContent()
                    : NotFound($"No placement with id {id}.");
            }
            catch (Exception ex) { Console.WriteLine($"[LAB_SPACES] {Request.Method} {Request.Path} failed: {ex.Message}"); return StatusCode(500, $"Error deleting placement: {ex.Message}"); }
        }
    }
}
