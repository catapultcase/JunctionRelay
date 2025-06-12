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
using Dapper;
using System.Data;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_Services
    {
        private readonly IDbConnection _db;
        private readonly Service_Database_Manager_Sensors _sensorsDbManager;

        public Service_Database_Manager_Services(IDbConnection dbConnection,
                                                 Service_Database_Manager_Sensors sensorsDbManager)
        {
            _db = dbConnection;
            _sensorsDbManager = sensorsDbManager;
        }

        public async Task<List<Model_Service>> GetAllServicesAsync()
        {
            var services = (await _db.QueryAsync<Model_Service>("SELECT * FROM Services")).ToList();

            foreach (var service in services)
            {
                var protocols = await _db.QueryAsync<Model_Protocol>(
                    "SELECT p.Id, p.Name, sp.Selected FROM Protocols p JOIN ServiceProtocols sp ON p.Id = sp.ProtocolId WHERE sp.ServiceId = @ServiceId",
                    new { ServiceId = service.Id });

                var sensors = await _db.QueryAsync<Model_Sensor>(
                    "SELECT * FROM Sensors WHERE ServiceId = @ServiceId",
                    new { ServiceId = service.Id });

                service.SupportedProtocols = protocols.ToList();
                service.Sensors = sensors.ToList();
            }

            return services;
        }

        public async Task<Model_Service?> GetServiceByIdAsync(int id)
        {
            var service = await _db.QuerySingleOrDefaultAsync<Model_Service>(
                "SELECT * FROM Services WHERE Id = @Id",
                new { Id = id }
            );
            if (service == null)
                return null;

            var protocols = await _db.QueryAsync<Model_Protocol>(
                @"SELECT p.Id, p.Name, sp.Selected
          FROM Protocols p
          JOIN ServiceProtocols sp ON p.Id = sp.ProtocolId
          WHERE sp.ServiceId = @ServiceId",
                new { ServiceId = service.Id }
            );

            var sensors = await _db.QueryAsync<Model_Sensor>(
                "SELECT * FROM Sensors WHERE ServiceId = @ServiceId",
                new { ServiceId = id }
            );

            service.SupportedProtocols = protocols.ToList();
            service.Sensors = sensors.ToList();
            return service;
        }


        public async Task<Model_Service> AddServiceAsync(Model_Service newService)
        {
            newService.Status ??= "Offline";
            newService.LastUpdated = DateTime.UtcNow;

            var sql = @"
                INSERT INTO Services (
                    Name, Description, Type, Status, LastUpdated, IPAddress, PollRate, SendRate, IsGateway, GatewayId, IsJunctionRelayService, SelectedPort,
                    ServiceModel, ServiceManufacturer, FirmwareVersion, MCU, WirelessConnectivity, UniqueIdentifier, 
                    IsGateway, IsJunctionRelayService, MQTTBrokerAddress, MQTTBrokerPort, MQTTUsername, MQTTPassword
                )
                VALUES (
                    @Name, @Description, @Type, @Status, @LastUpdated, @IPAddress, @PollRate, @SendRate, @IsGateway, @GatewayId, @IsJunctionRelayService, @SelectedPort,
                    @ServiceModel, @ServiceManufacturer, @FirmwareVersion, @MCU, @WirelessConnectivity, @UniqueIdentifier, 
                    @IsGateway, @IsJunctionRelayService, @MQTTBrokerAddress, @MQTTBrokerPort, @MQTTUsername, @MQTTPassword
                );
                SELECT last_insert_rowid();";

            int newId = await _db.ExecuteScalarAsync<int>(sql, newService);
            newService.Id = newId;

            return newService;
        }

        public async Task<bool> UpdateServiceAsync(int id, Model_Service updatedService)
        {
            var existing = await _db.QuerySingleOrDefaultAsync<Model_Service>("SELECT * FROM Services WHERE Id = @Id", new { Id = id });
            if (existing == null) return false;

            updatedService.LastUpdated = DateTime.UtcNow;
            updatedService.Id = id;

            var sql = @"
                UPDATE Services SET
                    Name = @Name, Description = @Description, Type = @Type, Status = @Status, LastUpdated = @LastUpdated,
                    IPAddress = @IPAddress, PollRate = @PollRate, SendRate = @SendRate, IsGateway = @IsGateway, GatewayId = @GatewayId,
                    IsJunctionRelayService = @IsJunctionRelayService, SelectedPort = @SelectedPort,
                    ServiceModel = @ServiceModel, ServiceManufacturer = @ServiceManufacturer,
                    FirmwareVersion = @FirmwareVersion, MCU = @MCU, WirelessConnectivity = @WirelessConnectivity,
                    UniqueIdentifier = @UniqueIdentifier, 
                    IsGateway = @IsGateway, IsJunctionRelayService = @IsJunctionRelayService, 
                    MQTTBrokerAddress = @MQTTBrokerAddress, MQTTBrokerPort = @MQTTBrokerPort, MQTTUsername = @MQTTUsername, MQTTPassword = @MQTTPassword
                WHERE Id = @Id;";

            await _db.ExecuteAsync(sql, updatedService);

            // Update protocols
            if (updatedService.SupportedProtocols != null)
            {
                foreach (var protocol in updatedService.SupportedProtocols)
                {
                    var protocolId = await _db.ExecuteScalarAsync<int>(
                        "SELECT Id FROM Protocols WHERE Name = @ProtocolName",
                        new { ProtocolName = protocol.Name });

                    await _db.ExecuteAsync(
                        "UPDATE ServiceProtocols SET Selected = @Selected WHERE ServiceId = @ServiceId AND ProtocolId = @ProtocolId",
                        new { Selected = protocol.Selected, ServiceId = id, ProtocolId = protocolId });
                }
            }            

            return true;
        }

        public async Task<bool> DeleteServiceAsync(int id)
        {
            var service = await _db.QuerySingleOrDefaultAsync<Model_Service>("SELECT * FROM Services WHERE Id = @Id", new { Id = id });
            if (service == null) return false;

            // Delete associated protocols
            await _db.ExecuteAsync("DELETE FROM ServiceProtocols WHERE ServiceId = @Id", new { Id = id });

            // Delete associated sensors
            await _db.ExecuteAsync("DELETE FROM Sensors WHERE ServiceId = @Id", new { Id = id });

            // Delete the service
            await _db.ExecuteAsync("DELETE FROM Services WHERE Id = @Id", new { Id = id });

            return true;
        }
    }
}
