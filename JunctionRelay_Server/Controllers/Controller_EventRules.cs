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
using JunctionRelayServer.Services.BackgroundServices;
using JunctionRelay_Server.Services;

namespace JunctionRelayServer.Controllers
{
    [Route("api/eventrules")]
    [ApiController]
    public class Controller_EventRules : ControllerBase
    {
        private readonly Service_Database_Manager_EventRules _eventRuleDb;
        private readonly Service_Events _eventService;
        private readonly Service_Database_Manager_Sensors _sensorDb;

        public Controller_EventRules(
            Service_Database_Manager_EventRules eventRuleDb,
            Service_Events eventService,
            Service_Database_Manager_Sensors sensorDb)
        {
            _eventRuleDb = eventRuleDb;
            _eventService = eventService;
            _sensorDb = sensorDb;
        }

        // POST: /api/eventrules
        [HttpPost]
        public async Task<IActionResult> AddEventRule([FromBody] CreateEventRuleRequest request)
        {
            try
            {
                var newRule = new Model_EventRule
                {
                    Name = request.Name,
                    Description = request.Description,
                    Enabled = request.Enabled,
                    TriggerLogic = request.TriggerLogic ?? "ANY"
                };

                var added = await _eventRuleDb.CreateRuleAsync(
                    newRule,
                    request.Triggers ?? new List<Model_EventTrigger>(),
                    request.Actions ?? new List<Model_EventAction>());

                await _eventService.ReloadRulesAsync();

                return CreatedAtAction(nameof(GetEventRuleById), new { id = added.Id }, added);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error adding event rule: {ex.Message}");
            }
        }

        // GET: /api/eventrules/{id}
        [HttpGet("{id}")]
        public async Task<IActionResult> GetEventRuleById(int id)
        {
            try
            {
                var rule = await _eventRuleDb.GetRuleByIdAsync(id);
                if (rule == null) return NotFound();

                var enrichedRule = await EnrichRuleWithNames(rule);
                return Ok(enrichedRule);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error fetching event rule: {ex.Message}");
            }
        }

        // GET: /api/eventrules
        [HttpGet]
        public async Task<IActionResult> GetAllEventRules()
        {
            try
            {
                var rules = await _eventRuleDb.GetAllRulesAsync();
                var enrichedRules = new List<object>();

                foreach (var rule in rules)
                {
                    enrichedRules.Add(await EnrichRuleWithNames(rule));
                }

                return Ok(enrichedRules);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error fetching event rules: {ex.Message}");
            }
        }

        // PUT: /api/eventrules/{id}
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateEventRule(int id, [FromBody] UpdateEventRuleRequest request)
        {
            try
            {
                var existingRule = await _eventRuleDb.GetRuleByIdAsync(id);
                if (existingRule == null)
                {
                    return NotFound($"Event rule with ID {id} not found.");
                }

                var updatedRule = new Model_EventRule
                {
                    Id = id,
                    Name = request.Name,
                    Description = request.Description,
                    Enabled = request.Enabled,
                    TriggerLogic = request.TriggerLogic ?? "ANY",
                    LastTriggered = existingRule.LastTriggered,
                    TriggerCount = existingRule.TriggerCount,
                };

                var success = await _eventRuleDb.UpdateRuleAsync(
                    updatedRule,
                    request.Triggers ?? new List<Model_EventTrigger>(),
                    request.Actions ?? new List<Model_EventAction>());

                if (!success)
                {
                    return StatusCode(500, "Failed to update event rule");
                }

                await _eventService.ReloadRulesAsync();

                var result = await _eventRuleDb.GetRuleByIdAsync(id);
                var enrichedResult = await EnrichRuleWithNames(result);
                return Ok(enrichedResult);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error updating event rule: {ex.Message}");
            }
        }

        // DELETE: /api/eventrules/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteEventRule(int id)
        {
            try
            {
                var deleted = await _eventRuleDb.DeleteRuleAsync(id);
                if (!deleted) return NotFound($"Event rule with ID {id} not found.");

                await _eventService.ReloadRulesAsync();

                return NoContent();
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error deleting event rule: {ex.Message}");
            }
        }

        // POST: /api/eventrules/{id}/toggle
        [HttpPost("{id}/toggle")]
        public async Task<IActionResult> ToggleEventRule(int id, [FromBody] ToggleEventRuleRequest request)
        {
            try
            {
                var rule = await _eventRuleDb.GetRuleByIdAsync(id);
                if (rule == null) return NotFound();

                rule.Enabled = request.Enabled;
                var success = await _eventRuleDb.UpdateRuleAsync(rule, rule.Triggers, rule.Actions);

                if (!success)
                {
                    return StatusCode(500, "Failed to toggle event rule");
                }

                await _eventService.ReloadRulesAsync();

                return Ok(new { status = $"Event rule {(request.Enabled ? "enabled" : "disabled")}" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error toggling event rule: {ex.Message}");
            }
        }

        // GET: /api/eventrules/sensor/{sensorId}
        [HttpGet("sensor/{sensorId}")]
        public async Task<IActionResult> GetEventRulesBySensorId(int sensorId)
        {
            try
            {
                var rules = await _eventRuleDb.GetRulesBySensorIdAsync(sensorId);
                var enrichedRules = new List<object>();

                foreach (var rule in rules)
                {
                    enrichedRules.Add(await EnrichRuleWithNames(rule));
                }

                return Ok(enrichedRules);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error fetching event rules for sensor: {ex.Message}");
            }
        }

        // Helper method to enrich rules with sensor/junction names
        private async Task<object> EnrichRuleWithNames(Model_EventRule rule)
        {
            // Enrich triggers with sensor names
            var enrichedTriggers = new List<object>();
            foreach (var trigger in rule.Triggers)
            {
                string? triggerSensorName = null;
                if (trigger.TriggerSensorId.HasValue)
                {
                    var triggerSensor = await _sensorDb.GetSensorByIdAsync(trigger.TriggerSensorId.Value);
                    triggerSensorName = triggerSensor?.Name;
                }

                enrichedTriggers.Add(new
                {
                    trigger.Id,
                    trigger.EventRuleId,
                    trigger.TriggerOrder,
                    trigger.IsActive,
                    trigger.TriggerType,
                    trigger.TriggerSensorId,
                    TriggerSensorName = triggerSensorName,
                    trigger.TriggerCondition,
                    trigger.TriggerValue,
                    trigger.TriggerDebounceMs
                });
            }

            // Enrich actions with sensor/junction names
            var enrichedActions = new List<object>();
            foreach (var action in rule.Actions)
            {
                string? actionTargetSensorName = null;
                if (action.ActionTargetSensorId.HasValue)
                {
                    var targetSensor = await _sensorDb.GetSensorByIdAsync(action.ActionTargetSensorId.Value);
                    actionTargetSensorName = targetSensor?.Name;
                }

                // TODO: Fetch junction name when needed
                string? actionJunctionName = null;

                enrichedActions.Add(new
                {
                    action.Id,
                    action.EventRuleId,
                    action.ActionOrder,
                    action.IsActive,
                    action.DelayBeforeNextMs,
                    action.ActionType,
                    action.ActionTargetSensorId,
                    ActionTargetSensorName = actionTargetSensorName,
                    action.ActionStaticValue,
                    action.ActionTransform,
                    action.ActionJunctionId,
                    ActionJunctionName = actionJunctionName,
                    action.ActionMqttTopic,
                    action.ActionMqttPayload,
                    action.ActionMqttServiceId,
                    action.ActionHttpUrl,
                    action.ActionHttpMethod,
                    action.ActionHttpPayload
                });
            }

            return new
            {
                rule.Id,
                rule.Name,
                rule.Description,
                rule.Enabled,
                rule.TriggerLogic,
                Triggers = enrichedTriggers,
                Actions = enrichedActions,
                rule.LastTriggered,
                rule.TriggerCount,
            };
        }
    }

    public class CreateEventRuleRequest
    {
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public bool Enabled { get; set; } = true;
        public string? TriggerLogic { get; set; } = "ANY";
        public List<Model_EventTrigger>? Triggers { get; set; }
        public List<Model_EventAction>? Actions { get; set; }
    }

    public class UpdateEventRuleRequest
    {
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public bool Enabled { get; set; }
        public string? TriggerLogic { get; set; } = "ANY";
        public List<Model_EventTrigger>? Triggers { get; set; }
        public List<Model_EventAction>? Actions { get; set; }
    }

    public class ToggleEventRuleRequest
    {
        public bool Enabled { get; set; }
    }
}