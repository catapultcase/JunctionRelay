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
using JunctionRelayServer.Services;

namespace JunctionRelayServer.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class Controller_COM_Ports : ControllerBase
    {
        private readonly Service_Manager_COM_Ports _comPortManager;

        public Controller_COM_Ports(Service_Manager_COM_Ports comPortManager)
        {
            _comPortManager = comPortManager;
        }

        // GET: api/Controller_Com_Ports/com-ports
        [HttpGet("com-ports")]
        public IActionResult GetAvailableComPorts()
        {
            try
            {
                var comPorts = _comPortManager.GetAvailableCOMPorts();
                return Ok(comPorts);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        // POST: api/Controller_Com_Ports/open?portName=COM3&baudRate=115200
        [HttpPost("open")]
        public IActionResult OpenConnection([FromQuery] string portName, [FromQuery] int baudRate)
        {
            try
            {
                _comPortManager.OpenConnection(portName, baudRate);
                return Ok($"Port {portName} opened at {baudRate} baud.");
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        // POST: api/Controller_Com_Ports/close?portName=COM3
        [HttpPost("close")]
        public IActionResult CloseConnection([FromQuery] string portName)
        {
            try
            {
                _comPortManager.CloseConnection(portName);
                return Ok($"Port {portName} closed.");
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        // POST: api/Controller_Com_Ports/send?portName=COM3
        [HttpPost("send")]
        public async Task<IActionResult> SendData([FromQuery] string portName)
        {
            try
            {
                using (StreamReader reader = new StreamReader(Request.Body))
                {
                    string data = await reader.ReadToEndAsync();

                    if (string.IsNullOrWhiteSpace(data))
                        return BadRequest("The data field is required.");

                    Console.WriteLine($"[INFO] Received raw data for {portName}: {data}");

                    _comPortManager.SendData(portName, data);

                    return Ok(new { message = $"Data sent to port {portName}.", sentData = data });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] Error sending data: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // GET: api/Controller_Com_Ports/status?portName=COM3
        [HttpGet("status")]
        public IActionResult GetPortStatus([FromQuery] string portName)
        {
            try
            {
                var status = _comPortManager.GetPortStatus(portName);
                return Ok(status);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }
    }
}
