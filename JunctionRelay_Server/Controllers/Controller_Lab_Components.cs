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
    [Route("api/lab/components")]
    public class Controller_Lab_Components : ControllerBase
    {
        private readonly Service_Database_Manager_Lab_Components _componentsDb;
        private readonly Service_Database_Manager_Lab_MarketValues _marketDb;

        public Controller_Lab_Components(Service_Database_Manager_Lab_Components componentsDb,
            Service_Database_Manager_Lab_MarketValues marketDb)
        {
            _componentsDb = componentsDb;
            _marketDb = marketDb;
        }

        // machineId=0 filters to the shelf (no machine)
        [HttpGet]
        public async Task<IActionResult> GetAllComponents(
            [FromQuery] string? type, [FromQuery] int? machineId, [FromQuery] string? status)
        {
            try
            {
                var components = await _componentsDb.GetAllComponentsAsync(type, machineId, status);
                return Ok(components);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_COMPONENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching components: {ex.Message}");
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetComponentById(int id)
        {
            try
            {
                var component = await _componentsDb.GetComponentByIdAsync(id);
                if (component == null) return NotFound($"Component {id} not found.");
                return Ok(component);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_COMPONENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching component: {ex.Message}");
            }
        }

        [HttpPost]
        public async Task<IActionResult> CreateComponent([FromBody] Model_Lab_Component component)
        {
            if (string.IsNullOrWhiteSpace(component.Type))
                return BadRequest("Type is required.");
            if (!Service_Database_Manager_Lab_Components.IsValidStatus(component.Status))
                return BadRequest(InvalidStatusMessage(component.Status));

            try
            {
                var id = await _componentsDb.CreateComponentAsync(component);
                var created = await _componentsDb.GetComponentByIdAsync(id);
                return CreatedAtAction(nameof(GetComponentById), new { id }, created);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_COMPONENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error creating component: {ex.Message}");
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateComponent(int id, [FromBody] Model_Lab_Component component)
        {
            if (component.Id != 0 && component.Id != id)
                return BadRequest("ID mismatch.");
            if (string.IsNullOrWhiteSpace(component.Type))
                return BadRequest("Type is required.");
            if (!Service_Database_Manager_Lab_Components.IsValidStatus(component.Status))
                return BadRequest(InvalidStatusMessage(component.Status));

            try
            {
                component.Id = id;
                var updated = await _componentsDb.UpdateComponentAsync(component);
                if (!updated) return NotFound($"Component {id} not found.");
                return Ok(await _componentsDb.GetComponentByIdAsync(id));
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_COMPONENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error updating component: {ex.Message}");
            }
        }

        // Hard delete only when the component has no movement history;
        // otherwise it is disposed (shelved + flagged) so the ledger stays intact.
        // force=true eradicates a mistaken/duplicate component entirely - its
        // movement rows and attachments included.
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteComponent(int id, [FromQuery] bool force = false)
        {
            try
            {
                if (force)
                {
                    var removed = await _componentsDb.ForceDeleteComponentAsync(id);
                    if (!removed) return NotFound($"Component {id} not found.");
                    return NoContent();
                }
                var result = await _componentsDb.DeleteOrDisposeComponentAsync(id);
                return result switch
                {
                    "notfound" => NotFound($"Component {id} not found."),
                    "deleted" => NoContent(),
                    _ => Ok(new { disposed = true, message = "Component has movement history; marked as disposed instead of deleted." })
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_COMPONENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error deleting component: {ex.Message}");
            }
        }

        private static string InvalidStatusMessage(string? status) =>
            $"Unknown status '{status}'. Valid statuses: " +
            string.Join(", ", Service_Database_Manager_Lab_Components.ComponentStatuses) + ".";

        // The vocabulary itself, so the UI's dropdown and an agent's options come from the
        // same place the server validates against.
        [HttpGet("/api/lab/component-statuses")]
        public IActionResult GetStatuses()
        {
            try
            {
                return Ok(new
                {
                    statuses = Service_Database_Manager_Lab_Components.ComponentStatuses,
                    retired = Service_Database_Manager_Lab_Components.RetiredStatuses,
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_COMPONENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching statuses: {ex.Message}");
            }
        }

        // Retire a part (sold/dead/damaged/lost/disposed) or return it to service, without
        // rewriting every other field.
        [HttpPost("{id}/status")]
        public async Task<IActionResult> SetStatus(int id, [FromBody] SetStatusRequest request)
        {
            try
            {
                var updated = await _componentsDb.SetStatusAsync(id, request.Status, request.Reason);
                if (updated == null) return NotFound($"Component {id} not found.");
                return Ok(updated);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_COMPONENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error setting status: {ex.Message}");
            }
        }

        public class SetStatusRequest
        {
            public string Status { get; set; } = "";
            public string? Reason { get; set; }
        }

        // The RAM-swap primitive: one ledger row + pointer update, transactional.
        [HttpPost("{id}/move")]
        public async Task<IActionResult> MoveComponent(int id, [FromBody] MoveComponentRequest request)
        {
            try
            {
                var movement = await _componentsDb.MoveComponentAsync(
                    id, request.ToMachineId, request.MovedAt, request.SlotLabel, request.Reason);
                if (movement == null) return NotFound($"Component {id} not found.");
                return Ok(movement);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_COMPONENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error moving component: {ex.Message}");
            }
        }

        // Undo a mis-recorded move: deletes the ledger row and restores the prior
        // location. Latest movement only - the service enforces it.
        [HttpDelete("{id}/movements/{movementId}")]
        public async Task<IActionResult> UndoMovement(int id, int movementId)
        {
            try
            {
                var undone = await _componentsDb.UndoMovementAsync(id, movementId);
                if (undone == null) return NotFound($"Movement {movementId} not found for component {id}.");
                return Ok(undone);
            }
            catch (InvalidOperationException ex)
            {
                return Conflict(ex.Message);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_COMPONENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error undoing movement: {ex.Message}");
            }
        }

        [HttpGet("{id}/movements")]
        public async Task<IActionResult> GetMovements(int id)
        {
            try
            {
                var component = await _componentsDb.GetComponentByIdAsync(id);
                if (component == null) return NotFound($"Component {id} not found.");

                var movements = await _componentsDb.GetMovementsForComponentAsync(id);
                return Ok(movements);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_COMPONENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching movements: {ex.Message}");
            }
        }

        public class MoveComponentRequest
        {
            public int? ToMachineId { get; set; }    // null = move to shelf
            public DateTime? MovedAt { get; set; }   // null = now; backdatable for imports
            public string? SlotLabel { get; set; }
            public string? Reason { get; set; }
        }
    
        // ---- market values: the append-only price-observation ledger ----------------
        // Msrp = launch, ListPrice = the invoice's list at purchase. Both are facts about a
        // past event. "What does it sell for now" is an observation with a date, so it is
        // rows, not a column - and it is never updated, because the series is the point.

        [HttpGet("{id}/market-values")]
        public async Task<IActionResult> GetMarketValues(int id)
        {
            try
            {
                var component = await _componentsDb.GetComponentByIdAsync(id);
                if (component == null) return NotFound($"Component {id} not found.");
                return Ok(await _marketDb.GetForComponentAsync(id));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_COMPONENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching market values: {ex.Message}");
            }
        }

        // ⚠️ Append-only is the rule, but a ledger with no way to remove a WRONG row is not
        // honest either - a mis-recorded price would sit in the series forever, and an agent
        // can and will record one. This is a correction path, not a normal one: it deletes a
        // single observation by id and cannot edit a value in place, so the only way to
        // change a figure is to remove it and record the right one, visibly.
        [HttpDelete("{id}/market-values/{valueId}")]
        public async Task<IActionResult> DeleteMarketValue(int id, int valueId)
        {
            try
            {
                var removed = await _marketDb.DeleteAsync(id, valueId);
                if (!removed) return NotFound($"Observation {valueId} not found for component {id}.");
                return NoContent();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_COMPONENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error deleting market value: {ex.Message}");
            }
        }

        [HttpPost("{id}/market-values")]
        public async Task<IActionResult> RecordMarketValue(int id, [FromBody] Model_Lab_MarketValue value)
        {
            var component = await _componentsDb.GetComponentByIdAsync(id);
            if (component == null) return NotFound($"Component {id} not found.");
            if (value.Value <= 0) return BadRequest("Value must be greater than zero.");

            // ⛔ NEW retail only. A used price and a new price answer different questions,
            // and a series mixing them shows a trend that never happened. Rejected at the
            // API rather than normalised, so a caller sending "used" learns it is wrong.
            var cond = (value.Condition ?? "new").Trim().ToLowerInvariant();
            if (cond is not ("" or "new"))
                return BadRequest($"This ledger tracks NEW retail prices only; got condition '{value.Condition}'. " +
                                  "Second-hand, refurbished and open-box prices are a different question.");
            value.Condition = "new";

            var src = (value.Source ?? "").Trim().ToLowerInvariant();
            if (src.Contains("ebay") || src.Contains("marketplace") || src.Contains("craigslist")
                || src.Contains("swappa") || src.Contains("facebook") || src.Contains("used"))
                return BadRequest($"Source '{value.Source}' is a resale channel; this ledger tracks new retail only.");

            value.ComponentId = id;
            try
            {
                var newId = await _marketDb.RecordAsync(value);
                return Ok(await _marketDb.GetLatestForComponentAsync(id));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_COMPONENTS] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error recording market value: {ex.Message}");
            }
        }
    }
}
