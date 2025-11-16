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
    public class Service_Manager_Payloads
    {
        private readonly Service_Manager_Payloads_FrameEngine _frameEngineGenerator;
        private readonly Service_Manager_Payloads_Config _configGenerator;
        private readonly Service_Manager_Payloads_Sensor _sensorGenerator;
        private readonly Service_Manager_Payloads_Blit _blitGenerator;
        private readonly Service_Manager_Payloads_Prefix _prefixService;

        public Service_Manager_Payloads(
            Service_Database_Manager_Sensors sensorDb,
            Service_Manager_Connections serviceManagerConnections,
            Service_Database_Manager_Layouts layoutsDb,
            Service_FrameEngine frameEngine,
            Service_Database_Manager_FrameEngine frameLayoutDb,
            Service_Database_Manager_JunctionLinks junctionLinksService,
            IHttpContextAccessor httpContextAccessor,
            Service_Manager_Events eventManager)
        {
            _prefixService = new Service_Manager_Payloads_Prefix();

            _frameEngineGenerator = new Service_Manager_Payloads_FrameEngine(
                frameLayoutDb, httpContextAccessor, serviceManagerConnections, layoutsDb, _prefixService, eventManager);

            _configGenerator = new Service_Manager_Payloads_Config(
                layoutsDb, frameEngine, frameLayoutDb, junctionLinksService,
                serviceManagerConnections, httpContextAccessor, _prefixService);

            _sensorGenerator = new Service_Manager_Payloads_Sensor(
                serviceManagerConnections, layoutsDb, _prefixService, eventManager);

            _blitGenerator = new Service_Manager_Payloads_Blit();
        }

        public async Task<Model_PayloadResultCollection> GenerateFrameEngineConfigPayloadsAsync(
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            Model_JunctionScreenLayout? screenOverride = null,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            return await _frameEngineGenerator.GenerateFrameEngineConfigPayloadsAsync(
                screenKey, assignedSensors, screen, screenOverride,
                junctionType, gatewayDestination, compressPayload);
        }

        public async Task<Model_PayloadResultCollection> GenerateFrameEngineSensorPayloadsAsync(
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            return await _frameEngineGenerator.GenerateFrameEngineSensorPayloadsAsync(
                screenKey, assignedSensors, screen, junctionType, gatewayDestination, compressPayload);
        }

        public async Task<Model_PayloadResultCollection> GenerateConfigPayloadsAsync(
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

        public async Task<Model_PayloadResultCollection> GenerateMQTTSubscriptionConfigPayloadsAsync(
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

        public async Task<Model_PayloadResultCollection> GenerateSensorPayloadsAsync(
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

        public byte[] GenerateBlitFramePayload(
            byte[] rgb565Data,
            bool compressPayload = false,
            bool isGatewayMode = false)
        {
            return _blitGenerator.GenerateBlitFramePayload(rgb565Data, compressPayload, isGatewayMode);
        }

        public byte[] SerializeGatewayCommand(
            object command,
            bool compressPayload = false)
        {
            return _configGenerator.SerializeGatewayCommand(command, compressPayload);
        }
    }
}