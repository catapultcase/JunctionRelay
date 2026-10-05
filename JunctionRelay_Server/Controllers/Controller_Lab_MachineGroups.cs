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
    [Route("api/lab/machine-groups")]
    public class Controller_Lab_MachineGroups : ControllerBase
    {
        private readonly Service_Database_Manager_Lab_MachineGroups _groupsDb;

        public Controller_Lab_MachineGroups(Service_Database_Manager_Lab_MachineGroups groupsDb)
        {
            _groupsDb = groupsDb;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllGroups()
        {
            try
            {
                return Ok(await _groupsDb.GetAllGroupsAsync());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MACHINEGROUPS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching machine groups: {ex.Message}");
            }
        }

        [HttpPost]
        public async Task<IActionResult> CreateGroup([FromBody] Model_Lab_MachineGroup group)
        {
            if (string.IsNullOrWhiteSpace(group.Name))
                return BadRequest("Name is required.");
            if (string.IsNullOrWhiteSpace(group.RolesJson) || group.RolesJson == "[]")
                return BadRequest("At least one role is required.");

            try
            {
                var id = await _groupsDb.CreateGroupAsync(group);
                var created = await _groupsDb.GetGroupByIdAsync(id);
                return CreatedAtAction(nameof(GetAllGroups), new { id }, created);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MACHINEGROUPS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error creating machine group: {ex.Message}");
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateGroup(int id, [FromBody] Model_Lab_MachineGroup group)
        {
            if (group.Id != 0 && group.Id != id)
                return BadRequest("ID mismatch.");
            if (string.IsNullOrWhiteSpace(group.Name))
                return BadRequest("Name is required.");

            try
            {
                group.Id = id;
                var updated = await _groupsDb.UpdateGroupAsync(group);
                if (!updated) return NotFound($"Machine group {id} not found.");
                return Ok(await _groupsDb.GetGroupByIdAsync(id));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MACHINEGROUPS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error updating machine group: {ex.Message}");
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteGroup(int id)
        {
            try
            {
                var deleted = await _groupsDb.DeleteGroupAsync(id);
                if (!deleted) return NotFound($"Machine group {id} not found.");
                return NoContent();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MACHINEGROUPS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error deleting machine group: {ex.Message}");
            }
        }

        [HttpPost("reorder")]
        public async Task<IActionResult> ReorderGroups([FromBody] ReorderRequest request)
        {
            if (request.OrderedIds == null || request.OrderedIds.Count == 0)
                return BadRequest("OrderedIds is required.");

            try
            {
                await _groupsDb.ReorderGroupsAsync(request.OrderedIds);
                return Ok(await _groupsDb.GetAllGroupsAsync());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MACHINEGROUPS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error reordering machine groups: {ex.Message}");
            }
        }

        public class ReorderRequest
        {
            public List<int> OrderedIds { get; set; } = new();
        }
    }
}
