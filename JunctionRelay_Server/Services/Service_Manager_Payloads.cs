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

namespace JunctionRelayServer.Services
{

    /// Main orchestrator for payload generation. Delegates to specialized generators.

    public class Service_Manager_Payloads
    {
        private readonly Service_Manager_Payloads_Rive _riveGenerator;
        private readonly Service_Manager_Payloads_Config _configGenerator;
        private readonly Service_Manager_Payloads_Sensor _sensorGenerator;

        public Service_Manager_Payloads(
            Service_Database_Manager_Sensors sensorDb,
            Service_Manager_Connections serviceManagerConnections,
            Service_Database_Manager_Layouts layoutsDb,
            Service_FrameEngine frameEngine,
            Service_Database_Manager_FrameEngine frameLayoutDb,
            Service_Database_Manager_JunctionLinks junctionLinksService,
            IHttpContextAccessor httpContextAccessor)
        {
            _riveGenerator = new Service_Manager_Payloads_Rive(
                frameLayoutDb, httpContextAccessor, serviceManagerConnections, layoutsDb);

            _configGenerator = new Service_Manager_Payloads_Config(
                layoutsDb, frameEngine, frameLayoutDb, junctionLinksService,
                serviceManagerConnections, httpContextAccessor);

            _sensorGenerator = new Service_Manager_Payloads_Sensor(
                serviceManagerConnections, layoutsDb);
        }

        // Delegate to Rive generator
        public async Task<Dictionary<string, object>> GenerateRiveConfigPayloadsAsync(
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            Model_JunctionScreenLayout? screenOverride = null,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            return await _riveGenerator.GenerateRiveConfigPayloadsAsync(
                screenKey, assignedSensors, screen, screenOverride,
                junctionType, gatewayDestination, compressPayload);
        }

        public async Task<Dictionary<string, object>> GenerateRiveSensorPayloadsAsync(
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            return await _riveGenerator.GenerateRiveSensorPayloadsAsync(
                screenKey, assignedSensors, screen, junctionType, gatewayDestination, compressPayload);
        }

        // Delegate to Config generator
        public async Task<Dictionary<string, object>> GenerateConfigPayloadsAsync(
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            Model_Screen_Layout? overrideTemplate = null,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            return await _configGenerator.GenerateConfigPayloadsAsync(
                screenKey, assignedSensors, screen, overrideTemplate,
                junctionType, gatewayDestination, compressPayload);
        }

        public async Task<Dictionary<string, object>> GenerateMQTTSubscriptionConfigPayloadsAsync(
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            return await _configGenerator.GenerateMQTTSubscriptionConfigPayloadsAsync(
                screenKey, assignedSensors, screen, junctionType, gatewayDestination, compressPayload);
        }

        // Delegate to Sensor generator
        public async Task<Dictionary<string, object>> GenerateSensorPayloadsAsync(
            string screenId,
            int sensorCount,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            return await _sensorGenerator.GenerateSensorPayloadsAsync(
                screenId, sensorCount, assignedSensors, screen,
                junctionType, gatewayDestination, compressPayload);
        }

        public async Task<Dictionary<string, object>> GenerateMatrixSensorPayloadsAsync(
            string screenId,
            int sensorCount,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            int startingYOffset,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            return await _sensorGenerator.GenerateMatrixSensorPayloadsAsync(
                screenId, sensorCount, assignedSensors, screen, startingYOffset,
                junctionType, gatewayDestination, compressPayload);
        }

        // Gateway command serialization (utility method)
        public string SerializeGatewayCommand(
            object command,
            bool includePrefix,
            bool compressPayload = false,
            string routingHint = "01")
        {
            return _configGenerator.SerializeGatewayCommand(command, includePrefix, compressPayload, routingHint);
        }
    }
}