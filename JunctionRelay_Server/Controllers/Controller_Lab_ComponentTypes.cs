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
    [Route("api/lab/component-types")]
    public class Controller_Lab_ComponentTypes : ControllerBase
    {
        private readonly Service_Database_Manager_Lab_ComponentTypes _typesDb;

        public Controller_Lab_ComponentTypes(Service_Database_Manager_Lab_ComponentTypes typesDb)
        {
            _typesDb = typesDb;
        }

        [HttpGet]
        public async Task<IActionResult> GetTypes([FromQuery] bool includeRetired = true)
        {
            try { return Ok(await _typesDb.GetAllAsync(includeRetired)); }
            catch (Exception ex) { Console.WriteLine($"[LAB_COMPONENTTYPES] {Request.Method} {Request.Path} failed: {ex.Message}"); return StatusCode(500, $"Error fetching types: {ex.Message}"); }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetTypeById(int id)
        {
            try
            {
                var t = await _typesDb.GetByIdAsync(id);
                return t == null ? NotFound($"No type with id {id}.") : Ok(t);
            }
            catch (Exception ex) { Console.WriteLine($"[LAB_COMPONENTTYPES] {Request.Method} {Request.Path} failed: {ex.Message}"); return StatusCode(500, $"Error fetching type: {ex.Message}"); }
        }

        [HttpPost]
        public async Task<IActionResult> CreateType([FromBody] Model_Lab_ComponentType type)
        {
            if (string.IsNullOrWhiteSpace(type.Name)) return BadRequest("Name is required.");
            if (await _typesDb.GetByNameAsync(type.Name) != null)
                return Conflict($"A type named '{type.Name}' already exists.");
            try
            {
                type.Id = await _typesDb.CreateAsync(type);
                return CreatedAtAction(nameof(GetTypeById), new { id = type.Id }, type);
            }
            catch (Exception ex) { Console.WriteLine($"[LAB_COMPONENTTYPES] {Request.Method} {Request.Path} failed: {ex.Message}"); return StatusCode(500, $"Error creating type: {ex.Message}"); }
        }

        // Editing the name here does NOT move the components filed under the old one - use
        // the rename endpoint for that. Kept separate so a label/field edit cannot silently
        // recategorise inventory.
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateType(int id, [FromBody] Model_Lab_ComponentType type)
        {
            if (string.IsNullOrWhiteSpace(type.Name)) return BadRequest("Name is required.");
            try
            {
                type.Id = id;
                return await _typesDb.UpdateAsync(type)
                    ? Ok(await _typesDb.GetByIdAsync(id))
                    : NotFound($"No type with id {id}.");
            }
            catch (Exception ex) { Console.WriteLine($"[LAB_COMPONENTTYPES] {Request.Method} {Request.Path} failed: {ex.Message}"); return StatusCode(500, $"Error updating type: {ex.Message}"); }
        }

        // Renames and repoints every component filed under the old name, in one transaction.
        [HttpPost("{id}/rename")]
        public async Task<IActionResult> RenameType(int id, [FromBody] RenameTypeRequest request)
        {
            if (string.IsNullOrWhiteSpace(request?.NewName)) return BadRequest("newName is required.");
            var clash = await _typesDb.GetByNameAsync(request.NewName);
            if (clash != null && clash.Id != id)
                return Conflict($"A type named '{request.NewName}' already exists.");
            try
            {
                var moved = await _typesDb.RenameAndRepointAsync(id, request.NewName);
                var updated = await _typesDb.GetByIdAsync(id);
                return updated == null
                    ? NotFound($"No type with id {id}.")
                    : Ok(new { type = updated, componentsRepointed = moved });
            }
            catch (Exception ex) { Console.WriteLine($"[LAB_COMPONENTTYPES] {Request.Method} {Request.Path} failed: {ex.Message}"); return StatusCode(500, $"Error renaming type: {ex.Message}"); }
        }

        [HttpPost("reorder")]
        public async Task<IActionResult> Reorder([FromBody] List<int> idsInOrder)
        {
            if (idsInOrder == null || idsInOrder.Count == 0) return BadRequest("An ordered list of ids is required.");
            try
            {
                await _typesDb.ReorderAsync(idsInOrder);
                return Ok(await _typesDb.GetAllAsync());
            }
            catch (Exception ex) { Console.WriteLine($"[LAB_COMPONENTTYPES] {Request.Method} {Request.Path} failed: {ex.Message}"); return StatusCode(500, $"Error reordering types: {ex.Message}"); }
        }

        // Blocked while components are filed under it - retire it instead.
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteType(int id)
        {
            try
            {
                var result = await _typesDb.DeleteAsync(id);
                if (result == "deleted") return NoContent();
                if (result == "not found") return NotFound($"No type with id {id}.");
                return Conflict(result);
            }
            catch (Exception ex) { Console.WriteLine($"[LAB_COMPONENTTYPES] {Request.Method} {Request.Path} failed: {ex.Message}"); return StatusCode(500, $"Error deleting type: {ex.Message}"); }
        }

        public class RenameTypeRequest
        {
            public string NewName { get; set; } = string.Empty;
        }
    }
}
