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

using System.Data;
using Dapper;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_MQTT_Subscriptions
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_MQTT_Subscriptions(IDbConnection db)
        {
            _db = db;
        }

        public async Task<IEnumerable<Model_MQTT_Subscriptions>> GetSubscriptionsForServiceAsync(int serviceId)
        {
            return await _db.QueryAsync<Model_MQTT_Subscriptions>(
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

            return await _db.ExecuteScalarAsync<int>(sql, subscription);
        }

        public async Task<int> DeactivateSubscriptionAsync(int id)
        {
            var sql = @"
                UPDATE MqttSubscriptions
                SET Active = 0
                WHERE Id = @Id
            ";

            return await _db.ExecuteAsync(sql, new { Id = id });
        }

        public async Task<int> DeleteSubscriptionAsync(int id)
        {
            var sql = @"
                DELETE FROM MqttSubscriptions
                WHERE Id = @Id
            ";

            return await _db.ExecuteAsync(sql, new { Id = id });
        }

        public async Task<int> DeleteSubscriptionAsyncByTopic(int serviceId, string topic)
        {
            var sql = @"
                DELETE FROM MqttSubscriptions
                WHERE ServiceId = @ServiceId AND Topic = @Topic
            ";

            return await _db.ExecuteAsync(sql, new { ServiceId = serviceId, Topic = topic });
        }
    }
}
