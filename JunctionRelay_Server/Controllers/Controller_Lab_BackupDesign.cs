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
    // Homelab module (LAB) - the backups page's boxes, data sets, jobs and rules, editable from the page itself.
    [ApiController]
    [Route("api/lab/backup-design")]
    public class Controller_Lab_BackupDesign : ControllerBase
    {
        private readonly Service_Database_Manager_Lab_BackupDesign _db;
        private readonly Service_Database_Manager_Lab_Machines _machines;
        public Controller_Lab_BackupDesign(Service_Database_Manager_Lab_BackupDesign db, Service_Database_Manager_Lab_Machines machines)
        { _db = db; _machines = machines; }

        private ObjectResult Fail(string what, Exception ex)
        {
            Console.WriteLine($"[LAB_BACKUP_DESIGN] {what} failed: {ex.Message}");
            return StatusCode(500, $"Error {what}: {ex.Message}");
        }

        private async Task<IEnumerable<int>> MachineIdsAsync() => (await _machines.GetAllMachinesAsync()).Select(m => m.Id);

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            try { return Ok(await _db.GetAllAsync()); }
            catch (Exception ex) { return Fail("fetching the backups design", ex); }
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] Model_Lab_BackupDesign e)
        {
            try
            {
                if (await _db.InvalidAsync(e, await MachineIdsAsync()) is string why) return BadRequest(why);
                var id = await _db.CreateAsync(e);
                return Ok(await _db.GetByIdAsync(id));
            }
            catch (Exception ex) { return Fail("creating a backups design element", ex); }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(int id, [FromBody] Model_Lab_BackupDesign e)
        {
            try
            {
                if (await _db.GetByIdAsync(id) == null) return NotFound($"No backups element with id {id}.");
                e.Id = id;
                if (await _db.InvalidAsync(e, await MachineIdsAsync()) is string why) return BadRequest(why);
                await _db.UpdateAsync(e);
                return Ok(await _db.GetByIdAsync(id));
            }
            catch (Exception ex) { return Fail("updating a backups design element", ex); }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            try { return await _db.DeleteAsync(id) ? Ok() : NotFound($"No backups element with id {id}."); }
            catch (Exception ex) { return Fail("deleting a backups design element", ex); }
        }
    }
}
