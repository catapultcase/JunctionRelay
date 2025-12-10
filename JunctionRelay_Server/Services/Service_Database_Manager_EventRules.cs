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

using Dapper;
using System.Data;
using JunctionRelayServer.Services.BackgroundServices;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_EventRules
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_EventRules(IDbConnection db)
        {
            _db = db;
        }

        public async Task<IEnumerable<Model_EventRule>> GetAllRulesAsync()
        {
            var sql = "SELECT * FROM EventRules ORDER BY Name";
            var rules = await Task.FromResult(_db.Query<Model_EventRule>(sql).ToList());

            foreach (var rule in rules)
            {
                rule.Triggers = await GetTriggersForRuleAsync(rule.Id);
                rule.Actions = await GetActionsForRuleAsync(rule.Id);
            }

            return rules;
        }

        public async Task<Model_EventRule?> GetRuleByIdAsync(int id)
        {
            var sql = "SELECT * FROM EventRules WHERE Id = @Id";
            var rule = await Task.FromResult(_db.QueryFirstOrDefault<Model_EventRule>(sql, new { Id = id }));

            if (rule != null)
            {
                rule.Triggers = await GetTriggersForRuleAsync(rule.Id);
                rule.Actions = await GetActionsForRuleAsync(rule.Id);
            }

            return rule;
        }

        public async Task<Model_EventRule> CreateRuleAsync(
            Model_EventRule rule,
            List<Model_EventTrigger> triggers,
            List<Model_EventAction> actions)
        {
            var sql = @"
                INSERT INTO EventRules (
                    Name, Description, Enabled, TriggerLogic,
                    CreatedAt, UpdatedAt
                ) VALUES (
                    @Name, @Description, @Enabled, @TriggerLogic,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                );
                SELECT last_insert_rowid();
            ";

            var id = await Task.FromResult(_db.ExecuteScalar<int>(sql, rule));
            rule.Id = id;

            // Insert triggers
            foreach (var trigger in triggers)
            {
                trigger.EventRuleId = id;
                await CreateTriggerAsync(trigger);
            }

            // Insert actions
            foreach (var action in actions)
            {
                action.EventRuleId = id;
                await CreateActionAsync(action);
            }

            rule.Triggers = triggers;
            rule.Actions = actions;
            return rule;
        }

        public async Task<bool> UpdateRuleAsync(
            Model_EventRule rule,
            List<Model_EventTrigger> triggers,
            List<Model_EventAction> actions)
        {
            var sql = @"
                UPDATE EventRules SET
                    Name = @Name,
                    Description = @Description,
                    Enabled = @Enabled,
                    TriggerLogic = @TriggerLogic,
                    UpdatedAt = CURRENT_TIMESTAMP
                WHERE Id = @Id
            ";

            var rowsAffected = await Task.FromResult(_db.Execute(sql, rule));

            // Delete existing triggers and actions
            await DeleteTriggersForRuleAsync(rule.Id);
            await DeleteActionsForRuleAsync(rule.Id);

            // Insert new triggers
            foreach (var trigger in triggers)
            {
                trigger.EventRuleId = rule.Id;
                await CreateTriggerAsync(trigger);
            }

            // Insert new actions
            foreach (var action in actions)
            {
                action.EventRuleId = rule.Id;
                await CreateActionAsync(action);
            }

            return rowsAffected > 0;
        }

        public async Task<bool> DeleteRuleAsync(int id)
        {
            // Triggers and actions will cascade delete due to ON DELETE CASCADE
            var sql = "DELETE FROM EventRules WHERE Id = @Id";
            var rowsAffected = await Task.FromResult(_db.Execute(sql, new { Id = id }));
            return rowsAffected > 0;
        }

        public async Task UpdateRuleMetadataAsync(int ruleId, DateTime lastTriggered, int triggerCount)
        {
            var sql = @"
                UPDATE EventRules 
                SET LastTriggered = @LastTriggered,
                    TriggerCount = @TriggerCount,
                    UpdatedAt = CURRENT_TIMESTAMP
                WHERE Id = @RuleId
            ";

            await Task.FromResult(_db.Execute(sql, new { RuleId = ruleId, LastTriggered = lastTriggered, TriggerCount = triggerCount }));
        }

        public async Task<IEnumerable<Model_EventRule>> GetRulesBySensorIdAsync(int sensorId)
        {
            var sql = @"
                SELECT DISTINCT er.* 
                FROM EventRules er
                INNER JOIN EventTriggers et ON er.Id = et.EventRuleId
                WHERE et.TriggerSensorId = @SensorId AND er.Enabled = 1
            ";
            var rules = await Task.FromResult(_db.Query<Model_EventRule>(sql, new { SensorId = sensorId }).ToList());

            foreach (var rule in rules)
            {
                rule.Triggers = await GetTriggersForRuleAsync(rule.Id);
                rule.Actions = await GetActionsForRuleAsync(rule.Id);
            }

            return rules;
        }

        // Helper methods for EventTriggers
        private async Task<List<Model_EventTrigger>> GetTriggersForRuleAsync(int ruleId)
        {
            var sql = "SELECT * FROM EventTriggers WHERE EventRuleId = @RuleId ORDER BY TriggerOrder";
            return await Task.FromResult(_db.Query<Model_EventTrigger>(sql, new { RuleId = ruleId }).ToList());
        }

        private async Task<int> CreateTriggerAsync(Model_EventTrigger trigger)
        {
            var sql = @"
                INSERT INTO EventTriggers (
                    EventRuleId, TriggerOrder, IsActive, TriggerType, TriggerSensorId,
                    TriggerCondition, TriggerValue, TriggerDebounceMs, CreatedAt
                ) VALUES (
                    @EventRuleId, @TriggerOrder, @IsActive, @TriggerType, @TriggerSensorId,
                    @TriggerCondition, @TriggerValue, @TriggerDebounceMs, CURRENT_TIMESTAMP
                );
                SELECT last_insert_rowid();
            ";

            return await Task.FromResult(_db.ExecuteScalar<int>(sql, trigger));
        }

        private async Task DeleteTriggersForRuleAsync(int ruleId)
        {
            var sql = "DELETE FROM EventTriggers WHERE EventRuleId = @RuleId";
            await Task.FromResult(_db.Execute(sql, new { RuleId = ruleId }));
        }

        // Helper methods for EventActions
        private async Task<List<Model_EventAction>> GetActionsForRuleAsync(int ruleId)
        {
            var sql = "SELECT * FROM EventActions WHERE EventRuleId = @RuleId ORDER BY ActionOrder";
            return await Task.FromResult(_db.Query<Model_EventAction>(sql, new { RuleId = ruleId }).ToList());
        }

        private async Task<int> CreateActionAsync(Model_EventAction action)
        {
            var sql = @"
                INSERT INTO EventActions (
                    EventRuleId, ActionOrder, IsActive, DelayBeforeNextMs,
                    ActionType, ActionTargetSensorId, ActionStaticValue, ActionTransform,
                    ActionJunctionId, ActionMqttTopic, ActionMqttPayload, ActionMqttServiceId,
                    ActionHttpUrl, ActionHttpMethod, ActionHttpPayload, CreatedAt
                ) VALUES (
                    @EventRuleId, @ActionOrder, @IsActive, @DelayBeforeNextMs,
                    @ActionType, @ActionTargetSensorId, @ActionStaticValue, @ActionTransform,
                    @ActionJunctionId, @ActionMqttTopic, @ActionMqttPayload, @ActionMqttServiceId,
                    @ActionHttpUrl, @ActionHttpMethod, @ActionHttpPayload, CURRENT_TIMESTAMP
                );
                SELECT last_insert_rowid();
            ";

            return await Task.FromResult(_db.ExecuteScalar<int>(sql, action));
        }

        private async Task DeleteActionsForRuleAsync(int ruleId)
        {
            var sql = "DELETE FROM EventActions WHERE EventRuleId = @RuleId";
            await Task.FromResult(_db.Execute(sql, new { RuleId = ruleId }));
        }
    }
}