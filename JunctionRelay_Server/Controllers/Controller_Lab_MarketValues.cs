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

using JunctionRelayServer.Services;
using Microsoft.AspNetCore.Mvc;

namespace JunctionRelayServer.Controllers
{
    // Cross-component reads of the market-value ledger. Per-component reads and the
    // write/correction paths live on Controller_Lab_Components, next to the component
    // they belong to; this controller is only for views that span the whole inventory.
    [ApiController]
    [Route("api/lab/market-values")]
    public class Controller_Lab_MarketValues : ControllerBase
    {
        private readonly Service_Database_Manager_Lab_MarketValues _marketDb;

        public Controller_Lab_MarketValues(Service_Database_Manager_Lab_MarketValues marketDb)
        {
            _marketDb = marketDb;
        }

        // Recent observations across all components, newest first, with component context,
        // the prior observation and the series-so-far - the Observations tab's feed.
        [HttpGet("recent")]
        public async Task<IActionResult> GetRecent([FromQuery] int limit = 200)
        {
            try
            {
                if (limit < 1) limit = 1;
                if (limit > 1000) limit = 1000;
                return Ok(await _marketDb.GetRecentObservationsAsync(limit));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LAB_MARKETVALUES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error fetching recent observations: {ex.Message}");
            }
        }
    }
}
