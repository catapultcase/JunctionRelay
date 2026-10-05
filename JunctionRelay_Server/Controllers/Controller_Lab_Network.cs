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
    // Homelab module (LAB) - the network page's nodes, ports, links and zones, editable from the page itself.
    // Every rule lives in Service_Database_Manager_Lab_Network, shared with the MCP tools.
    [ApiController]
    [Route("api/lab/network")]
    public class Controller_Lab_Network : ControllerBase
    {
        private readonly Service_Database_Manager_Lab_Network _db;
        public Controller_Lab_Network(Service_Database_Manager_Lab_Network db) { _db = db; }

        private ObjectResult Fail(string what, Exception ex)
        {
            Console.WriteLine($"[LAB_NETWORK] {what} failed: {ex.Message}");
            return StatusCode(500, $"Error {what}: {ex.Message}");
        }

        [HttpGet]
        public async Task<IActionResult> Get()
        {
            try { return Ok(await _db.GetGraphAsync()); }
            catch (Exception ex) { return Fail("reading the network", ex); }
        }

        // Preview the ports a record's spec would create, without saving (the Add device dialog).
        [HttpPost("preview-ports")]
        public async Task<IActionResult> PreviewPorts([FromBody] Model_Lab_NetworkNode n)
        {
            try
            {
                var (ports, error) = await _db.PortsFromSpecAsync(n);
                return error != null ? BadRequest(error) : Ok(ports);
            }
            catch (Exception ex) { return Fail("previewing ports", ex); }
        }

        // ── nodes ──
        [HttpPost("nodes")]
        public async Task<IActionResult> CreateNode([FromBody] Model_Lab_NetworkNode n, [FromQuery] bool withPorts = true)
        {
            try
            {
                if (await _db.InvalidNodeAsync(n) is string why) return BadRequest(why);
                var (id, added, warning) = await _db.CreateNodeAsync(n, withPorts);
                return Ok(new { node = await _db.GetNodeAsync(id), portsAdded = added, warning });
            }
            catch (Exception ex) { return Fail("creating a device", ex); }
        }

        [HttpPut("nodes/{id}")]
        public async Task<IActionResult> UpdateNode(int id, [FromBody] Model_Lab_NetworkNode n)
        {
            try
            {
                if (await _db.GetNodeAsync(id) == null) return NotFound($"No network node with id {id}.");
                n.Id = id;
                if (await _db.InvalidNodeAsync(n) is string why) return BadRequest(why);
                await _db.UpdateNodeAsync(n);
                return Ok(await _db.GetNodeAsync(id));
            }
            catch (Exception ex) { return Fail("updating a device", ex); }
        }

        // The Edit layout Save: { nodes: [{ id, x, y }], ports: [{ id, side, position }], margins: [{ key, growLeft, growTop, growRight, growBottom }] }, one transaction.
        [HttpPut("layout")]
        public async Task<IActionResult> SaveLayout([FromBody] Model_Lab_NetworkLayout layout)
        {
            try
            {
                if (layout.Ports.FirstOrDefault(p => !Service_Database_Manager_Lab_Network.Sides.Contains(p.Side)) is { } bad)
                    return BadRequest($"Port #{bad.Id}: side must be left, right, top or bottom.");
                if (layout.Margins.FirstOrDefault(m => !System.Text.RegularExpressions.Regex.IsMatch(m.Key, @"^(space|zone):\d+$")) is { } badKey)
                    return BadRequest($"Margin key '{badKey.Key}' must be space:<id> or zone:<id>.");
                await _db.SaveLayoutAsync(layout);
                return Ok();
            }
            catch (Exception ex) { return Fail("saving the layout", ex); }
        }

        [HttpPost("nodes/{id}/sync-ports")]
        public async Task<IActionResult> SyncPorts(int id)
        {
            try
            {
                if (await _db.GetNodeAsync(id) == null) return NotFound($"No network node with id {id}.");
                var (added, warning) = await _db.SyncPortsAsync(id);
                return Ok(new { portsAdded = added, warning });
            }
            catch (Exception ex) { return Fail("syncing ports", ex); }
        }

        [HttpDelete("nodes/{id}")]
        public async Task<IActionResult> DeleteNode(int id)
        {
            try { return await _db.DeleteNodeAsync(id) ? Ok() : NotFound($"No network node with id {id}."); }
            catch (Exception ex) { return Fail("deleting a device", ex); }
        }

        // ── ports ──
        [HttpPost("ports")]
        public async Task<IActionResult> CreatePort([FromBody] Model_Lab_NetworkPort p)
        {
            try
            {
                if (await _db.InvalidPortAsync(p) is string why) return BadRequest(why);
                var id = await _db.CreatePortAsync(p);
                return Ok(await _db.GetPortAsync(id));
            }
            catch (Exception ex) { return Fail("creating a port", ex); }
        }

        [HttpPut("ports/{id}")]
        public async Task<IActionResult> UpdatePort(int id, [FromBody] Model_Lab_NetworkPort p)
        {
            try
            {
                var existing = await _db.GetPortAsync(id);
                if (existing == null) return NotFound($"No port with id {id}.");
                p.Id = id;
                p.NodeId = existing.NodeId;     // a port stays on its device; move it by deleting and adding
                if (await _db.InvalidPortAsync(p) is string why) return BadRequest(why);
                await _db.UpdatePortAsync(p);
                return Ok(await _db.GetPortAsync(id));
            }
            catch (Exception ex) { return Fail("updating a port", ex); }
        }

        [HttpDelete("ports/{id}")]
        public async Task<IActionResult> DeletePort(int id)
        {
            try { return await _db.DeletePortAsync(id) ? Ok() : NotFound($"No port with id {id}."); }
            catch (Exception ex) { return Fail("deleting a port", ex); }
        }

        // ── links ──
        [HttpPost("links")]
        public async Task<IActionResult> CreateLink([FromBody] Model_Lab_NetworkLink l)
        {
            try
            {
                if (await _db.InvalidLinkAsync(l) is string why) return BadRequest(why);
                var id = await _db.CreateLinkAsync(l);
                return Ok(await _db.GetLinkAsync(id));
            }
            catch (Exception ex) { return Fail("creating a link", ex); }
        }

        [HttpPut("links/{id}")]
        public async Task<IActionResult> UpdateLink(int id, [FromBody] Model_Lab_NetworkLink l)
        {
            try
            {
                if (await _db.GetLinkAsync(id) == null) return NotFound($"No link with id {id}.");
                l.Id = id;
                if (await _db.InvalidLinkAsync(l) is string why) return BadRequest(why);
                await _db.UpdateLinkAsync(l);
                return Ok(await _db.GetLinkAsync(id));
            }
            catch (Exception ex) { return Fail("updating a link", ex); }
        }

        [HttpDelete("links/{id}")]
        public async Task<IActionResult> DeleteLink(int id)
        {
            try { return await _db.DeleteLinkAsync(id) ? Ok() : NotFound($"No link with id {id}."); }
            catch (Exception ex) { return Fail("deleting a link", ex); }
        }

        // ── zones ──
        [HttpPost("zones")]
        public async Task<IActionResult> CreateZone([FromBody] Model_Lab_NetworkZone z)
        {
            try
            {
                if (await _db.InvalidZoneAsync(z) is string why) return BadRequest(why);
                var id = await _db.CreateZoneAsync(z);
                return Ok(await _db.GetZoneAsync(id));
            }
            catch (Exception ex) { return Fail("creating a zone", ex); }
        }

        [HttpPut("zones/{id}")]
        public async Task<IActionResult> UpdateZone(int id, [FromBody] Model_Lab_NetworkZone z)
        {
            try
            {
                if (await _db.GetZoneAsync(id) == null) return NotFound($"No zone with id {id}.");
                z.Id = id;
                if (await _db.InvalidZoneAsync(z) is string why) return BadRequest(why);
                await _db.UpdateZoneAsync(z);
                return Ok(await _db.GetZoneAsync(id));
            }
            catch (Exception ex) { return Fail("updating a zone", ex); }
        }

        [HttpDelete("zones/{id}")]
        public async Task<IActionResult> DeleteZone(int id)
        {
            try { return await _db.DeleteZoneAsync(id) ? Ok() : NotFound($"No zone with id {id}."); }
            catch (Exception ex) { return Fail("deleting a zone", ex); }
        }

        // One device in or out of a zone: { "zoneId": 3 } or { "zoneId": null }.
        public class NodeZoneBody { public int? ZoneId { get; set; } }

        [HttpPut("nodes/{id}/zone")]
        public async Task<IActionResult> SetNodeZone(int id, [FromBody] NodeZoneBody body)
        {
            try
            {
                if (await _db.GetNodeAsync(id) == null) return NotFound($"No network node with id {id}.");
                if (body.ZoneId is int zid && await _db.GetZoneAsync(zid) == null) return BadRequest($"No zone with id {zid}.");
                await _db.SetNodeZoneAsync(id, body.ZoneId);
                return Ok();
            }
            catch (Exception ex) { return Fail("setting a device's zone", ex); }
        }
    }
}
