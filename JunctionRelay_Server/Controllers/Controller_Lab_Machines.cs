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
    [Route("api/lab/machines")]
    public class Controller_Lab_Machines : ControllerBase
    {
        private readonly Service_Database_Manager_Lab_Machines _machinesDb;

        public Controller_Lab_Machines(Service_Database_Manager_Lab_Machines machinesDb)
        {
            _machinesDb = machinesDb;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllMachines()
        {
            try
            {
                var machines = await _machinesDb.GetAllMachinesAsync();
                return Ok(machines);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MACHINES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching machines: {ex.Message}");
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetMachineById(int id)
        {
            try
            {
                var machine = await _machinesDb.GetMachineByIdAsync(id);
                if (machine == null) return NotFound($"Machine {id} not found.");
                return Ok(machine);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MACHINES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching machine: {ex.Message}");
            }
        }

        [HttpPost]
        public async Task<IActionResult> CreateMachine([FromBody] Model_Lab_Machine machine)
        {
            if (string.IsNullOrWhiteSpace(machine.Name))
                return BadRequest("Name is required.");

            try
            {
                var id = await _machinesDb.CreateMachineAsync(machine);
                var created = await _machinesDb.GetMachineByIdAsync(id);
                return CreatedAtAction(nameof(GetMachineById), new { id }, created);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MACHINES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error creating machine: {ex.Message}");
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateMachine(int id, [FromBody] Model_Lab_Machine machine)
        {
            if (machine.Id != 0 && machine.Id != id)
                return BadRequest("ID mismatch.");
            if (string.IsNullOrWhiteSpace(machine.Name))
                return BadRequest("Name is required.");

            try
            {
                machine.Id = id;
                // The Lab edit form does not carry Sentiment (it is written over MCP and read
                // on the Benchmarks page); a form save must not wipe it.
                if (machine.Sentiment == null)
                    machine.Sentiment = (await _machinesDb.GetMachineByIdAsync(id))?.Sentiment;
                var updated = await _machinesDb.UpdateMachineAsync(machine);
                if (!updated) return NotFound($"Machine {id} not found.");
                return Ok(await _machinesDb.GetMachineByIdAsync(id));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MACHINES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error updating machine: {ex.Message}");
            }
        }

        // The Sentiment alone: the Benchmarks page edits one field, so it must not have to send
        // the whole machine back. Empty text clears it.
        public class SentimentBody { public string? Sentiment { get; set; } }

        [HttpPut("{id}/sentiment")]
        public async Task<IActionResult> UpdateSentiment(int id, [FromBody] SentimentBody body)
        {
            try
            {
                var machine = await _machinesDb.GetMachineByIdAsync(id);
                if (machine == null) return NotFound($"Machine {id} not found.");
                machine.Sentiment = string.IsNullOrWhiteSpace(body.Sentiment) ? null : body.Sentiment.Trim();
                await _machinesDb.UpdateMachineAsync(machine);
                return Ok(machine);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MACHINES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error updating sentiment: {ex.Message}");
            }
        }

        // Never deletes components: installed parts are shelved via movement rows first.
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteMachine(int id)
        {
            try
            {
                var deleted = await _machinesDb.DeleteMachineAsync(id);
                if (!deleted) return NotFound($"Machine {id} not found.");
                return NoContent();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MACHINES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error deleting machine: {ex.Message}");
            }
        }

        // "What did this machine look like on this date" — replay of the movement ledger.
        [HttpGet("{id}/timeline")]
        public async Task<IActionResult> GetTimeline(int id, [FromQuery] DateTime? date)
        {
            try
            {
                var machine = await _machinesDb.GetMachineByIdAsync(id);
                if (machine == null) return NotFound($"Machine {id} not found.");

                var asOf = date ?? DateTime.UtcNow;
                var components = await _machinesDb.GetTimelineAsync(id, asOf);
                return Ok(new { machineId = id, asOf, components });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MACHINES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching timeline: {ex.Message}");
            }
        }

        [HttpGet("{id}/movements")]
        public async Task<IActionResult> GetMovements(int id)
        {
            try
            {
                var machine = await _machinesDb.GetMachineByIdAsync(id);
                if (machine == null) return NotFound($"Machine {id} not found.");

                var movements = await _machinesDb.GetMovementsForMachineAsync(id);
                return Ok(movements);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MACHINES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching movements: {ex.Message}");
            }
        }
    }
}
