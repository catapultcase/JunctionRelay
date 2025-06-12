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

using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Services;
using JunctionRelayServer.Models;
using JunctionRelayServer.Models.Requests;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json;
using System.Text;

namespace JunctionRelayServer.Controllers
{
    [Route("api/layouts")]
    [ApiController]
    public class Controller_Payloads : ControllerBase
    {
        private readonly Service_Database_Manager_Layouts _layoutTemplateDb;
        private readonly Service_Layout_Templates _layoutTemplateService;
        private readonly Service_Database_Manager_Sensors _sensorDb;
        private readonly Service_Manager_Payloads _payloadService;

        public Controller_Payloads(
            Service_Database_Manager_Layouts layoutTemplateDb,
            Service_Layout_Templates layoutTemplateService,
            Service_Database_Manager_Sensors sensorDb,
            Service_Manager_Payloads payloadService)
        {
            _layoutTemplateDb = layoutTemplateDb;
            _layoutTemplateService = layoutTemplateService;
            _sensorDb = sensorDb;
            _payloadService = payloadService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllTemplates()
        {
            var templates = await _layoutTemplateDb.GetAllTemplatesAsync();
            return Ok(templates);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetTemplateById(int id)
        {
            var template = await _layoutTemplateDb.GetTemplateByIdAsync(id);
            return template == null ? NotFound() : Ok(template);
        }

        [HttpPost]
        public async Task<IActionResult> AddTemplate([FromBody] Model_Screen_Layout template)
        {
            var newId = await _layoutTemplateDb.AddTemplateAsync(template);
            template.Id = newId;
            return CreatedAtAction(nameof(GetTemplateById), new { id = newId }, template);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateTemplate(int id, [FromBody] Model_Screen_Layout updated)
        {
            var success = await _layoutTemplateDb.UpdateTemplateAsync(id, updated);
            return success
                ? Ok(new { message = "Template updated successfully." })
                : NotFound();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteTemplate(int id)
        {
            var success = await _layoutTemplateDb.DeleteTemplateAsync(id);
            return success
                ? Ok(new { message = "Template deleted." })
                : NotFound();
        }

        [HttpPost("clone")]
        public async Task<IActionResult> CloneTemplate([FromBody] Model_Clone_Template_Request request)
        {
            try
            {
                var newId = await _layoutTemplateDb.CloneTemplateAsync(request.OriginalId);
                var clonedTemplate = await _layoutTemplateDb.GetTemplateByIdAsync(newId);
                return CreatedAtAction(nameof(GetTemplateById), new { id = newId }, clonedTemplate);
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPost("recreate")]
        public async Task<IActionResult> RecreateTemplate([FromBody] Model_Recreate_Template_Request request)
        {
            try
            {
                bool success = await _layoutTemplateService.CreateOrRestoreTemplateAsync(request.TemplateName);
                if (!success)
                    return NotFound(new { message = $"Template '{request.TemplateName}' could not be recreated." });

                var recreated = await _layoutTemplateDb.GetTemplateByNameAsync(request.TemplateName);
                return recreated != null
                    ? CreatedAtAction(nameof(GetTemplateById), new { id = recreated.Id }, recreated)
                    : StatusCode(500, new { message = "Recreation completed but template was not found." });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPost("restoreAll")]
        public async Task<IActionResult> RestoreAllTemplates()
        {
            try
            {
                await _layoutTemplateService.InitializeLayoutTemplatesAsync();
                var all = await _layoutTemplateDb.GetAllTemplatesAsync();
                return Ok(all);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Failed to restore all templates: {ex.Message}" });
            }
        }

        // New combined endpoint that returns both config and sensor payloads
        [HttpPost("{id}/preview-payload")]
        public async Task<IActionResult> PreviewPayload(
            int id,
            [FromQuery] int sensorCount = 4,
            [FromQuery] int startingYOffset = 0)
        {
            try
            {
                // Read the request body for potential config customizations
                string requestBody;
                using (var reader = new StreamReader(Request.Body, Encoding.UTF8, true, 1024, true))
                {
                    requestBody = await reader.ReadToEndAsync();
                }

                // 1) Fetch the template
                var template = await _layoutTemplateDb.GetTemplateByIdAsync(id);
                if (template == null)
                    return NotFound($"Layout template {id} not found.");

                // Apply any customizations from the request body
                if (!string.IsNullOrEmpty(requestBody))
                {
                    try
                    {
                        var payloadObj = JsonConvert.DeserializeObject(requestBody);
                        if (payloadObj is JObject jObjectPayload)
                        {
                            // Find the layout type and config
                            foreach (var prop in jObjectPayload.Properties())
                            {
                                if (prop.Name.ToLower() != "type" &&
                                    prop.Name.ToLower() != "screenid" &&
                                    prop.Name.ToLower() != "layout")
                                {
                                    if (prop.Value is JObject layoutConfig)
                                    {
                                        // Get all properties of our template
                                        var templateProperties = typeof(Model_Screen_Layout).GetProperties();

                                        // Loop through all layoutConfig properties
                                        foreach (var configProp in layoutConfig.Properties())
                                        {
                                            // Convert snake_case to PascalCase
                                            string propName = configProp.Name;
                                            if (propName.Contains("_"))
                                            {
                                                var parts = propName.Split('_');
                                                propName = string.Join("", parts.Select(p =>
                                                    p.Length > 0 ? char.ToUpper(p[0]) + p.Substring(1) : ""));
                                            }

                                            // Find matching property in the template
                                            var templateProp = templateProperties.FirstOrDefault(p =>
                                                string.Equals(p.Name, propName, StringComparison.OrdinalIgnoreCase));

                                            if (templateProp != null && templateProp.CanWrite)
                                            {
                                                try
                                                {
                                                    // Get the property type
                                                    Type propType = templateProp.PropertyType;

                                                    // Handle nullable types
                                                    if (propType.IsGenericType && propType.GetGenericTypeDefinition() == typeof(Nullable<>))
                                                    {
                                                        propType = Nullable.GetUnderlyingType(propType)!;
                                                    }

                                                    // Convert and set the value based on type
                                                    object? convertedValue = null;

                                                    if (configProp.Value == null || configProp.Value.Type == JTokenType.Null)
                                                    {
                                                        convertedValue = null;
                                                    }
                                                    else if (propType == typeof(int))
                                                    {
                                                        // Handle empty string case for int properties
                                                        if (configProp.Value.Type == JTokenType.String && string.IsNullOrEmpty(configProp.Value.Value<string>()))
                                                        {
                                                            convertedValue = null;
                                                        }
                                                        else
                                                        {
                                                            convertedValue = configProp.Value.Value<int>();
                                                        }
                                                    }
                                                    else if (propType == typeof(bool))
                                                    {
                                                        convertedValue = configProp.Value.Value<bool>();
                                                    }
                                                    else if (propType == typeof(string))
                                                    {
                                                        convertedValue = configProp.Value.Value<string>();
                                                    }
                                                    else if (propType == typeof(DateTime))
                                                    {
                                                        convertedValue = configProp.Value.Value<DateTime>();
                                                    }

                                                    // Set the property value directly on the template
                                                    templateProp.SetValue(template, convertedValue);
                                                }
                                                catch
                                                {
                                                    // Silently continue if property setting fails
                                                }
                                            }
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                    }
                    catch
                    {
                        // Continue with unmodified template if parsing fails
                    }
                }

                // 2) Create fake sensors using our shared helper method
                var sensors = CreatePreviewSensors(sensorCount);

                // 3) Create preview screen wrapper
                var previewScreen = new Model_Device_Screens
                {
                    Id = id,
                    ScreenKey = $"preview-{id}",
                    ScreenLayoutId = id,
                    Template = template
                };

                // 4) Generate the config payload
                var configPayloads = await _payloadService.GenerateConfigPayloadsAsync(
                    previewScreen.ScreenKey,
                    sensors,
                    previewScreen,
                    template
                );

                // 5) Generate the sensor payload based on layout type
                var sensorPayload = new Dictionary<string, object>();
                var random = new Random();
                string layoutType = template.LayoutType.ToUpperInvariant();

                if (layoutType == "MATRIX")
                {
                    var sensorItems = new Dictionary<string, object>();
                    int yOffset = startingYOffset;

                    foreach (var sensor in sensors)
                    {
                        string text = $"{sensor.SensorTag}: {sensor.Value} {sensor.Unit}";

                        sensorItems[sensor.SensorTag] = new
                        {
                            Position = new { x = 0, y = yOffset },
                            Data = new[] { new { text } }
                        };

                        yOffset += 8; // 8 pixels per line
                    }

                    var matrixPayload = new
                    {
                        type = "sensor",
                        screenId = previewScreen.ScreenKey,
                        sensors = sensorItems
                    };

                    string json = System.Text.Json.JsonSerializer.Serialize(matrixPayload);
                    string finalPayload = json.Length.ToString().PadLeft(8, '0') + json;
                    sensorPayload[previewScreen.ScreenKey] = finalPayload;
                }
                else if (layoutType == "NEOPIXEL")
                {
                    int red = random.Next(0, 256);
                    int green = random.Next(0, 256);
                    int blue = random.Next(0, 256);
                    int color = (red << 16) | (green << 8) | blue;

                    var neopixelPayload = new
                    {
                        type = "sensor",
                        screenId = previewScreen.ScreenKey,
                        sensors = new
                        {
                            neopixel = new { color }
                        }
                    };

                    string json = System.Text.Json.JsonSerializer.Serialize(neopixelPayload);
                    string finalPayload = json.Length.ToString().PadLeft(8, '0') + json;
                    sensorPayload[previewScreen.ScreenKey] = finalPayload;
                }
                else // Standard layouts
                {
                    var sensorItems = new Dictionary<string, object>();

                    foreach (var sensor in sensors)
                    {
                        sensorItems[sensor.SensorTag] = new[]
                        {
                    new { Value = sensor.Value, Unit = sensor.Unit }
                };
                    }

                    var stdPayload = new
                    {
                        type = "sensor",
                        screenId = previewScreen.ScreenKey,
                        sensors = sensorItems
                    };

                    string json = System.Text.Json.JsonSerializer.Serialize(stdPayload);
                    string finalPayload = json.Length.ToString().PadLeft(8, '0') + json;
                    sensorPayload[previewScreen.ScreenKey] = finalPayload;
                }

                // 6) Combine both payloads and return
                var combinedResult = new
                {
                    configPayload = configPayloads,
                    sensorPayload = sensorPayload
                };

                return Ok(combinedResult);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error generating payloads: {ex.Message}");
            }
        }

        // Helper method to create fake sensor data for preview
        private List<Model_Sensor> CreatePreviewSensors(int sensorCount)
        {
            var random = new Random();

            return Enumerable.Range(1, sensorCount)
                .Select(i => new Model_Sensor
                {
                    Id = i,
                    OriginalId = i,
                    SensorOrder = i,
                    SensorTag = $"sensor_{i}",
                    // Use more realistic units
                    Unit = i % 4 == 0 ? "°C" : i % 3 == 0 ? "%" : i % 2 == 0 ? "W" : "lux",
                    // Generate random values
                    Value = random.Next(0, 100).ToString(),
                    ExternalId = $"ext_{i}",
                    DeviceName = "preview",
                    Name = $"Sensor {i}",
                    ComponentName = "PreviewComponent",
                    Category = "Synthetic",
                    SensorType = "Preview",
                    MQTTTopic = $"sensors/preview/{i}"
                })
                .ToList();
        }

        // Updated version of the existing config preview endpoint - renamed for consistency
        [HttpPost("{id}/preview-config-payload")]
        public async Task<IActionResult> PreviewConfigPayload(
            int id,
            [FromQuery] int sensorCount = 4
        )
        {
            // Read the request body directly
            string requestBody;
            using (var reader = new StreamReader(Request.Body, Encoding.UTF8, true, 1024, true))
            {
                requestBody = await reader.ReadToEndAsync();
            }

            try
            {
                // 1) fetch the template
                var template = await _layoutTemplateDb.GetTemplateByIdAsync(id);
                if (template == null)
                    return NotFound($"Layout template {id} not found.");

                // Parse the payload and apply to template if available
                if (!string.IsNullOrEmpty(requestBody))
                {
                    try
                    {
                        var payloadObj = JsonConvert.DeserializeObject(requestBody);
                        if (payloadObj is JObject jObjectPayload)
                        {
                            // Find the layout type and config
                            foreach (var prop in jObjectPayload.Properties())
                            {
                                if (prop.Name.ToLower() != "type" &&
                                    prop.Name.ToLower() != "screenid" &&
                                    prop.Name.ToLower() != "layout")
                                {
                                    if (prop.Value is JObject layoutConfig)
                                    {
                                        // Get all properties of our template
                                        var templateProperties = typeof(Model_Screen_Layout).GetProperties();

                                        // Loop through all layoutConfig properties
                                        foreach (var configProp in layoutConfig.Properties())
                                        {
                                            // Convert snake_case to PascalCase
                                            string propName = configProp.Name;
                                            if (propName.Contains("_"))
                                            {
                                                var parts = propName.Split('_');
                                                propName = string.Join("", parts.Select(p =>
                                                    p.Length > 0 ? char.ToUpper(p[0]) + p.Substring(1) : ""));
                                            }

                                            // Find matching property in the template
                                            var templateProp = templateProperties.FirstOrDefault(p =>
                                                string.Equals(p.Name, propName, StringComparison.OrdinalIgnoreCase));

                                            if (templateProp != null && templateProp.CanWrite)
                                            {
                                                try
                                                {
                                                    // Get the property type
                                                    Type propType = templateProp.PropertyType;

                                                    // Handle nullable types
                                                    if (propType.IsGenericType && propType.GetGenericTypeDefinition() == typeof(Nullable<>))
                                                    {
                                                        propType = Nullable.GetUnderlyingType(propType)!;
                                                    }

                                                    // Convert and set the value based on type
                                                    object? convertedValue = null;

                                                    if (configProp.Value == null || configProp.Value.Type == JTokenType.Null)
                                                    {
                                                        convertedValue = null;
                                                    }
                                                    else if (propType == typeof(int))
                                                    {
                                                        // Handle empty string case for int properties
                                                        if (configProp.Value.Type == JTokenType.String && string.IsNullOrEmpty(configProp.Value.Value<string>()))
                                                        {
                                                            convertedValue = null;
                                                        }
                                                        else
                                                        {
                                                            convertedValue = configProp.Value.Value<int>();
                                                        }
                                                    }
                                                    else if (propType == typeof(bool))
                                                    {
                                                        convertedValue = configProp.Value.Value<bool>();
                                                    }
                                                    else if (propType == typeof(string))
                                                    {
                                                        convertedValue = configProp.Value.Value<string>();
                                                    }
                                                    else if (propType == typeof(DateTime))
                                                    {
                                                        convertedValue = configProp.Value.Value<DateTime>();
                                                    }

                                                    // Set the property value directly on the template
                                                    templateProp.SetValue(template, convertedValue);
                                                }
                                                catch
                                                {
                                                    // Silently continue if property setting fails
                                                }
                                            }
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                    }
                    catch
                    {
                        // Continue with unmodified template if parsing fails
                    }
                }

                // 2) build fake sensors using our shared helper method
                var sensors = CreatePreviewSensors(sensorCount);

                // 3) preview screen wrapper
                var previewScreen = new Model_Device_Screens
                {
                    ScreenKey = $"preview-{id}",
                    ScreenLayoutId = id
                };

                // 4) hit your payload service with the template
                var payloads = await _payloadService.GenerateConfigPayloadsAsync(
                    previewScreen.ScreenKey,
                    sensors,
                    previewScreen,
                    template  // Pass the modified template directly
                );

                return Ok(payloads);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error generating payload: {ex.Message}");
            }
        }

        // New endpoint for sensor preview
        [HttpPost("{id}/preview-sensor-payload")]
        public async Task<IActionResult> PreviewSensorPayload(
            int id,
            [FromQuery] int sensorCount = 4,
            [FromQuery] int startingYOffset = 0)
        {
            try
            {
                // 1) Fetch the template
                var template = await _layoutTemplateDb.GetTemplateByIdAsync(id);
                if (template == null)
                    return NotFound($"Layout template {id} not found.");

                // 2) Create fake sensors using our shared helper method
                var sensors = CreatePreviewSensors(sensorCount);

                // 3) Create preview screen wrapper
                var previewScreen = new Model_Device_Screens
                {
                    Id = id,
                    ScreenKey = $"preview-{id}",
                    ScreenLayoutId = id,
                    Template = template
                };

                // 4) Create a sample sensor payload in the correct format based on layout type
                var result = new Dictionary<string, object>();
                var random = new Random();

                // Create a JSON object directly with the proper structure based on layout type
                object payload;
                string layoutType = template.LayoutType.ToUpperInvariant();

                if (layoutType == "MATRIX")
                {
                    var sensorItems = new Dictionary<string, object>();
                    int yOffset = startingYOffset; // Starting Y offset

                    foreach (var sensor in sensors)
                    {
                        string text = $"{sensor.SensorTag}: {sensor.Value} {sensor.Unit}";

                        sensorItems[sensor.SensorTag] = new
                        {
                            Position = new { x = 0, y = yOffset },
                            Data = new[] { new { text } }
                        };

                        yOffset += 8; // 8 pixels per line
                    }

                    payload = new
                    {
                        type = "sensor",
                        screenId = previewScreen.ScreenKey,
                        sensors = sensorItems
                    };
                }
                else if (layoutType == "NEOPIXEL")
                {
                    // Generate random RGB color
                    int red = random.Next(0, 256);
                    int green = random.Next(0, 256);
                    int blue = random.Next(0, 256);
                    int color = (red << 16) | (green << 8) | blue;

                    payload = new
                    {
                        type = "sensor",
                        screenId = previewScreen.ScreenKey,
                        sensors = new
                        {
                            neopixel = new { color }
                        }
                    };
                }
                else // Standard layouts (LVGL_GRID, LVGL_RADIO, QUAD, etc.)
                {
                    var sensorItems = new Dictionary<string, object>();

                    foreach (var sensor in sensors)
                    {
                        sensorItems[sensor.SensorTag] = new[]
                        {
                    new { Value = sensor.Value, Unit = sensor.Unit }
                };
                    }

                    payload = new
                    {
                        type = "sensor",
                        screenId = previewScreen.ScreenKey,
                        sensors = sensorItems
                    };
                }

                // Serialize and add length prefix
                string json = System.Text.Json.JsonSerializer.Serialize(payload);
                string finalPayload = json.Length.ToString().PadLeft(8, '0') + json;

                result[previewScreen.ScreenKey] = finalPayload;
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error generating sensor payload: {ex.Message}");
            }
        }
    }
}