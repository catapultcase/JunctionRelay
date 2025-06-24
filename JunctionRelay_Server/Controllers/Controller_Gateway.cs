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

using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Models;
using System.Data;
using Dapper;

namespace JunctionRelayServer.Controllers
{
    [Route("api/gateway")]
    [ApiController]
    public class Controller_Gateway : ControllerBase
    {
        private readonly IDbConnection _dbConnection;

        public Controller_Gateway(IDbConnection dbConnection)
        {
            _dbConnection = dbConnection;
        }

        // POST: api/gateway
        [HttpPost]
        public async Task<IActionResult> RegisterGateway([FromBody] Model_Device gateway)
        {
            if (string.IsNullOrWhiteSpace(gateway.Name) || string.IsNullOrWhiteSpace(gateway.Status))
            {
                return BadRequest("Gateway Name and Status are required.");
            }

            // Assign default values if not provided
            gateway.Status ??= "Online";
            gateway.LastUpdated = gateway.LastUpdated == default ? DateTime.UtcNow : gateway.LastUpdated;
            gateway.IsGateway = true;  // Mark this as a Gateway device

            var sql = @"
                INSERT INTO Devices 
                (Name, Type, Status, LastUpdated, IPAddress, IsGateway) 
                VALUES 
                (@Name, @Type, @Status, @LastUpdated, @IPAddress, @IsGateway);
                SELECT last_insert_rowid();";

            try
            {
                int newId = await _dbConnection.ExecuteScalarAsync<int>(sql, gateway);
                gateway.Id = newId;

                return CreatedAtAction(nameof(GetGatewayStatus), new { id = newId }, gateway);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Database error: {ex.Message}");
            }
        }

        // GET: api/gateway
        [HttpGet]
        public async Task<IActionResult> GetGatewayStatus()
        {
            var gateway = await _dbConnection.QuerySingleOrDefaultAsync<Model_Device>(
                "SELECT * FROM Devices WHERE IsGateway = 1 ORDER BY LastUpdated DESC LIMIT 1");

            if (gateway == null) return NotFound();
            return Ok(gateway);
        }

        // PUT: api/gateway/5
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateGatewayStatus(int id, [FromBody] Model_Device updatedGateway)
        {
            var sql = "UPDATE Devices SET Status = @Status, LastUpdated = @LastUpdated WHERE Id = @Id AND IsGateway = 1";

            int rowsAffected = await _dbConnection.ExecuteAsync(sql, new { updatedGateway.Status, updatedGateway.LastUpdated, Id = id });

            if (rowsAffected == 0) return NotFound();
            return NoContent();
        }
    }
}
