/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

using JunctionRelayServer.Models;
using JunctionRelayServer.Models.Requests;
using JunctionRelayServer.Services;
using Microsoft.AspNetCore.Mvc;

[Route("api/services")]
[ApiController]
public class Controller_Services : ControllerBase
{
    private readonly Service_Database_Manager_Services _serviceDb;
    private readonly Service_Manager_Services _serviceManager;
    private readonly Service_Database_Manager_Sensors _sensorDb;
    private readonly Service_Stream_Manager_MQTT _mqttManager;

    public Controller_Services(
        Service_Database_Manager_Services serviceDb,
        Service_Manager_Services serviceManager,
        Service_Database_Manager_Sensors sensorDb,
        Service_Stream_Manager_MQTT mqttManager)
    {
        _serviceDb = serviceDb;
        _serviceManager = serviceManager;
        _sensorDb = sensorDb;
        _mqttManager = mqttManager;
    }

    [HttpPost("set-mqtt-service/{id}")]
    public IActionResult SetMqttService(int id)
        => StatusCode(410, "SetMqttService is deprecated. Use broker-specific calls directly.");

    [HttpPost("connect-to-mqtt/{id}")]
    public async Task<IActionResult> ConnectToMqttBroker(int id)
    {
        var service = await _serviceDb.GetServiceByIdAsync(id);
        if (service == null) return NotFound($"Service with ID {id} not found.");
        await _mqttManager.ConnectAsync(service);
        return Ok(new { message = "Successfully connected to the MQTT broker." });
    }

    [HttpPost("disconnect-from-mqtt/{id}")]
    public async Task<IActionResult> DisconnectFromMqttBroker(int id)
    {
        var service = await _serviceDb.GetServiceByIdAsync(id);
        if (service == null) return NotFound($"Service with ID {id} not found.");
        await _mqttManager.DisconnectAsync(service);
        return Ok(new { message = "Disconnected from MQTT broker." });
    }

    [HttpGet("subscriptions/{id}")]
    public async Task<IActionResult> GetSubscriptions(int id)
    {
        var service = await _serviceDb.GetServiceByIdAsync(id);
        if (service == null) return NotFound($"Service with ID {id} not found.");

        var subscriptions = await _mqttManager.GetSubscribedTopics(service);

        var cleanSubscriptions = subscriptions.Select(s => new {
            topic = s.Topic,
            qos = s.QoS 
        }).ToList();

        return Ok(new { subscriptions = cleanSubscriptions });
    }


    [HttpPost("subscribe/{id}")]
    public async Task<IActionResult> SubscribeToTopic(int id, [FromBody] Model_MQTT_Subscribe_Request request)
    {
        var service = await _serviceDb.GetServiceByIdAsync(id);
        if (service == null) return NotFound($"Service with ID {id} not found.");

        await _mqttManager.SubscribeAsync(service, request.Topic, request.QoS);  // ✅ now pass QoS too

        return Ok(new { message = $"Subscribed to topic: {request.Topic} with QoS {request.QoS}" });
    }


    [HttpGet("payloads/{id}")]
    public async Task<IActionResult> GetAllPayloads(int id)
    {
        var service = await _serviceDb.GetServiceByIdAsync(id);
        if (service == null) return NotFound($"Service with ID {id} not found.");
        var payloads = _mqttManager.GetAllLatestPayloads(service);
        return Ok(payloads);
    }

    [HttpPost("publish/{id}")]
    public async Task<IActionResult> PublishMessage(int id, [FromBody] Model_MQTT_Publish_Request request)
    {
        var service = await _serviceDb.GetServiceByIdAsync(id);
        if (service == null) return NotFound($"Service with ID {id} not found.");
        await _mqttManager.PublishAsync(service, request.Topic, request.Message);
        return Ok(new { message = $"Published message to topic: {request.Topic}" });
    }

    [HttpGet]
    public async Task<IActionResult> GetAllServices() => Ok(await _serviceDb.GetAllServicesAsync());

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetServiceById(int id)
    {
        var service = await _serviceDb.GetServiceByIdAsync(id);
        return service == null ? NotFound() : Ok(service);
    }

    [HttpPost]
    public async Task<IActionResult> AddService([FromBody] Model_Service newService)
    {
        var added = await _serviceDb.AddServiceAsync(newService);
        return CreatedAtAction(nameof(GetServiceById), new { id = added.Id }, added);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateService(int id, [FromBody] Model_Service updatedService)
    {
        var success = await _serviceDb.UpdateServiceAsync(id, updatedService);
        return success ? Ok(new { message = "Service updated successfully." }) : NotFound();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteService(int id)
    {
        var success = await _serviceDb.DeleteServiceAsync(id);
        if (!success) return NotFound($"Service with ID {id} not found.");
        return Ok(new { message = "Service deleted successfully." });
    }

    [HttpPost("unsubscribe/{id}")]
    public async Task<IActionResult> UnsubscribeFromTopic(int id, [FromBody] Model_MQTT_Subscribe_Request request)
    {
        var service = await _serviceDb.GetServiceByIdAsync(id);
        if (service == null) return NotFound($"Service with ID {id} not found.");

        await _mqttManager.UnsubscribeAsync(service, request.Topic);

        return Ok(new { message = $"Unsubscribed from topic: {request.Topic}" });
    }

}
