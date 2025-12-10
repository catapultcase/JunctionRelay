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

using System.Data;
using Dapper;
using JunctionRelayServer.Models;
using JunctionRelayServer.Interfaces;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_MQTT_Subscriptions
    {
        private readonly IDatabaseConnectionFactory _dbFactory;

        public Service_Database_Manager_MQTT_Subscriptions(IDatabaseConnectionFactory dbFactory)
        {
            _dbFactory = dbFactory;
        }

        public async Task<IEnumerable<Model_MQTT_Subscriptions>> GetSubscriptionsForServiceAsync(int serviceId)
        {
            using var connection = _dbFactory.CreateConnection();
            return await connection.QueryAsync<Model_MQTT_Subscriptions>(
                @"SELECT * FROM MqttSubscriptions WHERE ServiceId = @ServiceId AND Active = 1",
                new { ServiceId = serviceId }
            );
        }

        public async Task<int> InsertSubscriptionAsync(Model_MQTT_Subscriptions subscription)
        {
            var sql = @"
                INSERT INTO MqttSubscriptions (ServiceId, Topic, QoS, Active)
                VALUES (@ServiceId, @Topic, @QoS, @Active);
                SELECT last_insert_rowid();
            ";

            using var connection = _dbFactory.CreateConnection();
            return await connection.ExecuteScalarAsync<int>(sql, subscription);
        }

        public async Task<int> DeactivateSubscriptionAsync(int id)
        {
            var sql = @"
                UPDATE MqttSubscriptions
                SET Active = 0
                WHERE Id = @Id
            ";

            using var connection = _dbFactory.CreateConnection();
            return await connection.ExecuteAsync(sql, new { Id = id });
        }

        public async Task<int> DeleteSubscriptionAsync(int id)
        {
            var sql = @"
                DELETE FROM MqttSubscriptions
                WHERE Id = @Id
            ";

            using var connection = _dbFactory.CreateConnection();
            return await connection.ExecuteAsync(sql, new { Id = id });
        }

        public async Task<int> DeleteSubscriptionAsyncByTopic(int serviceId, string topic)
        {
            var sql = @"
                DELETE FROM MqttSubscriptions
                WHERE ServiceId = @ServiceId AND Topic = @Topic
            ";

            using var connection = _dbFactory.CreateConnection();
            return await connection.ExecuteAsync(sql, new { ServiceId = serviceId, Topic = topic });
        }
    }
}
