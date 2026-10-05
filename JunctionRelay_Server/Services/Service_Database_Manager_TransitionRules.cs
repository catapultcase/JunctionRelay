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
using JunctionRelayServer.Models;
using System.Data;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_TransitionRules
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_TransitionRules(IDbConnection db)
        {
            _db = db;
        }

        // ============================================================
        // Transition Rules CRUD
        // ============================================================

        public async Task<IEnumerable<Model_TransitionRule>> GetAllTransitionRulesAsync()
        {
            const string sql = @"
                SELECT * FROM TransitionRules
                ORDER BY SortOrder ASC, Priority ASC";

            var rules = (await _db.QueryAsync<Model_TransitionRule>(sql)).ToList();

            // Load sensor conditions for each rule
            foreach (var rule in rules)
            {
                rule.SensorConditions = (await GetSensorConditionsForRuleAsync(rule.Id)).ToList();
            }

            return rules;
        }

        public async Task<Model_TransitionRule?> GetTransitionRuleByIdAsync(int id)
        {
            const string sql = "SELECT * FROM TransitionRules WHERE Id = @Id";
            var rule = await _db.QuerySingleOrDefaultAsync<Model_TransitionRule>(sql, new { Id = id });

            if (rule != null)
            {
                rule.SensorConditions = (await GetSensorConditionsForRuleAsync(rule.Id)).ToList();
            }

            return rule;
        }

        public async Task<int> CreateTransitionRuleAsync(Model_TransitionRule rule)
        {
            // Get max sort order
            var maxSortOrder = await _db.ExecuteScalarAsync<int?>("SELECT MAX(SortOrder) FROM TransitionRules") ?? -1;
            rule.SortOrder = maxSortOrder + 1;

            const string sql = @"
                INSERT INTO TransitionRules (
                    Name, Enabled, Priority, SortOrder, TriggerEvent, NewLayout,
                    TransitionEffect, TransitionDuration, TransitionLayoutPath,
                    TransitionLayoutInEffect, TransitionLayoutFadeIn, TransitionLayoutHold,
                    TransitionLayoutOutEffect, TransitionLayoutFadeOut,
                    ExistingLayoutExtend, NewLayoutExtend, ExistingLayoutFadeDuration,
                    NewLayoutFadeDuration, NewLayoutHold, PreviewTransitionTransparency,
                    TimelineJson, SensorLogic, CreatedAt, UpdatedAt
                ) VALUES (
                    @Name, @Enabled, @Priority, @SortOrder, @TriggerEvent, @NewLayout,
                    @TransitionEffect, @TransitionDuration, @TransitionLayoutPath,
                    @TransitionLayoutInEffect, @TransitionLayoutFadeIn, @TransitionLayoutHold,
                    @TransitionLayoutOutEffect, @TransitionLayoutFadeOut,
                    @ExistingLayoutExtend, @NewLayoutExtend, @ExistingLayoutFadeDuration,
                    @NewLayoutFadeDuration, @NewLayoutHold, @PreviewTransitionTransparency,
                    @TimelineJson, @SensorLogic, @CreatedAt, @UpdatedAt
                );
                SELECT last_insert_rowid();";

            rule.CreatedAt = DateTime.UtcNow;
            rule.UpdatedAt = DateTime.UtcNow;

            var id = await _db.ExecuteScalarAsync<int>(sql, rule);

            // Insert sensor conditions if provided
            if (rule.SensorConditions.Count > 0)
            {
                foreach (var condition in rule.SensorConditions)
                {
                    condition.RuleId = id;
                    await CreateSensorConditionAsync(condition);
                }
            }

            return id;
        }

        public async Task<bool> UpdateTransitionRuleAsync(Model_TransitionRule rule)
        {
            const string sql = @"
                UPDATE TransitionRules SET
                    Name = @Name,
                    Enabled = @Enabled,
                    Priority = @Priority,
                    SortOrder = @SortOrder,
                    TriggerEvent = @TriggerEvent,
                    NewLayout = @NewLayout,
                    TransitionEffect = @TransitionEffect,
                    TransitionDuration = @TransitionDuration,
                    TransitionLayoutPath = @TransitionLayoutPath,
                    TransitionLayoutInEffect = @TransitionLayoutInEffect,
                    TransitionLayoutFadeIn = @TransitionLayoutFadeIn,
                    TransitionLayoutHold = @TransitionLayoutHold,
                    TransitionLayoutOutEffect = @TransitionLayoutOutEffect,
                    TransitionLayoutFadeOut = @TransitionLayoutFadeOut,
                    ExistingLayoutExtend = @ExistingLayoutExtend,
                    NewLayoutExtend = @NewLayoutExtend,
                    ExistingLayoutFadeDuration = @ExistingLayoutFadeDuration,
                    NewLayoutFadeDuration = @NewLayoutFadeDuration,
                    NewLayoutHold = @NewLayoutHold,
                    PreviewTransitionTransparency = @PreviewTransitionTransparency,
                    TimelineJson = @TimelineJson,
                    SensorLogic = @SensorLogic,
                    UpdatedAt = @UpdatedAt
                WHERE Id = @Id";

            rule.UpdatedAt = DateTime.UtcNow;
            var affected = await _db.ExecuteAsync(sql, rule);

            // Update sensor conditions - delete existing and re-insert
            if (rule.SensorConditions != null)
            {
                await _db.ExecuteAsync("DELETE FROM TransitionRuleSensorConditions WHERE RuleId = @RuleId", new { RuleId = rule.Id });
                foreach (var condition in rule.SensorConditions)
                {
                    condition.RuleId = rule.Id;
                    await CreateSensorConditionAsync(condition);
                }
            }

            return affected > 0;
        }

        public async Task<bool> DeleteTransitionRuleAsync(int id)
        {
            // Cascade delete will handle sensor conditions and dynamic overrides
            const string sql = "DELETE FROM TransitionRules WHERE Id = @Id";
            var affected = await _db.ExecuteAsync(sql, new { Id = id });
            return affected > 0;
        }

        public async Task<bool> ReorderTransitionRulesAsync(List<int> ruleIds)
        {
            for (int i = 0; i < ruleIds.Count; i++)
            {
                await _db.ExecuteAsync(
                    "UPDATE TransitionRules SET SortOrder = @SortOrder, UpdatedAt = @UpdatedAt WHERE Id = @Id",
                    new { Id = ruleIds[i], SortOrder = i, UpdatedAt = DateTime.UtcNow });
            }
            return true;
        }

        // ============================================================
        // Sensor Conditions
        // ============================================================

        public async Task<IEnumerable<Model_TransitionRuleSensorCondition>> GetSensorConditionsForRuleAsync(int ruleId)
        {
            const string sql = "SELECT * FROM TransitionRuleSensorConditions WHERE RuleId = @RuleId";
            return await _db.QueryAsync<Model_TransitionRuleSensorCondition>(sql, new { RuleId = ruleId });
        }

        public async Task<int> CreateSensorConditionAsync(Model_TransitionRuleSensorCondition condition)
        {
            const string sql = @"
                INSERT INTO TransitionRuleSensorConditions (RuleId, SensorTag, Condition, Value)
                VALUES (@RuleId, @SensorTag, @Condition, @Value);
                SELECT last_insert_rowid();";

            return await _db.ExecuteScalarAsync<int>(sql, condition);
        }

        public async Task<bool> DeleteSensorConditionAsync(int id)
        {
            const string sql = "DELETE FROM TransitionRuleSensorConditions WHERE Id = @Id";
            var affected = await _db.ExecuteAsync(sql, new { Id = id });
            return affected > 0;
        }

        // ============================================================
        // Dynamic Overrides
        // ============================================================

        public async Task<IEnumerable<Model_TransitionRuleDynamicOverride>> GetDynamicOverridesForRuleAsync(int ruleId)
        {
            const string sql = "SELECT * FROM TransitionRuleDynamicOverrides WHERE RuleId = @RuleId";
            return await _db.QueryAsync<Model_TransitionRuleDynamicOverride>(sql, new { RuleId = ruleId });
        }

        public async Task<bool> UpdateDynamicOverridesForRuleAsync(int ruleId, List<Model_TransitionRuleDynamicOverride> overrides)
        {
            // Delete existing overrides
            await _db.ExecuteAsync("DELETE FROM TransitionRuleDynamicOverrides WHERE RuleId = @RuleId", new { RuleId = ruleId });

            // Insert new overrides
            const string sql = @"
                INSERT INTO TransitionRuleDynamicOverrides
                    (RuleId, SensorTag, OverrideEnabled, Value, SourceSensorTag, CustomSourceSensorTag)
                VALUES
                    (@RuleId, @SensorTag, @OverrideEnabled, @Value, @SourceSensorTag, @CustomSourceSensorTag)";

            foreach (var o in overrides)
            {
                o.RuleId = ruleId;
                await _db.ExecuteAsync(sql, o);
            }

            return true;
        }
    }
}
