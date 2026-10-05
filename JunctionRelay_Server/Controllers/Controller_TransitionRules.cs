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
using JunctionRelayServer.Services;
using Microsoft.AspNetCore.Mvc;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TransitionRulesController : ControllerBase
    {
        private readonly Service_Database_Manager_TransitionRules _transitionRulesDb;

        public TransitionRulesController(Service_Database_Manager_TransitionRules transitionRulesDb)
        {
            _transitionRulesDb = transitionRulesDb;
        }

        // GET: api/transitionrules
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Model_TransitionRule>>> GetAllRules()
        {
            try
            {
                var rules = await _transitionRulesDb.GetAllTransitionRulesAsync();
                return Ok(rules);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TRANSITION_RULES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error in GetAllRules: {ex.Message}");
            }
        }

        // GET: api/transitionrules/5
        [HttpGet("{id}")]
        public async Task<ActionResult<Model_TransitionRule>> GetRule(int id)
        {
            try
            {
                var rule = await _transitionRulesDb.GetTransitionRuleByIdAsync(id);
                if (rule == null)
                {
                    return NotFound();
                }
                return Ok(rule);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TRANSITION_RULES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error in GetRule: {ex.Message}");
            }
        }

        // POST: api/transitionrules
        [HttpPost]
        public async Task<ActionResult<Model_TransitionRule>> CreateRule([FromBody] Model_TransitionRule rule)
        {
            try
            {
                var id = await _transitionRulesDb.CreateTransitionRuleAsync(rule);
                var created = await _transitionRulesDb.GetTransitionRuleByIdAsync(id);
                return CreatedAtAction(nameof(GetRule), new { id }, created);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TRANSITION_RULES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error in CreateRule: {ex.Message}");
            }
        }

        // PUT: api/transitionrules/5
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateRule(int id, [FromBody] Model_TransitionRule rule)
        {
            try
            {
                if (id != rule.Id)
                {
                    return BadRequest("ID mismatch");
                }

                var existing = await _transitionRulesDb.GetTransitionRuleByIdAsync(id);
                if (existing == null)
                {
                    return NotFound();
                }

                await _transitionRulesDb.UpdateTransitionRuleAsync(rule);
                var updated = await _transitionRulesDb.GetTransitionRuleByIdAsync(id);
                return Ok(updated);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TRANSITION_RULES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error in UpdateRule: {ex.Message}");
            }
        }

        // DELETE: api/transitionrules/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteRule(int id)
        {
            try
            {
                var existing = await _transitionRulesDb.GetTransitionRuleByIdAsync(id);
                if (existing == null)
                {
                    return NotFound();
                }

                await _transitionRulesDb.DeleteTransitionRuleAsync(id);
                return NoContent();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TRANSITION_RULES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error in DeleteRule: {ex.Message}");
            }
        }

        // POST: api/transitionrules/reorder
        [HttpPost("reorder")]
        public async Task<IActionResult> ReorderRules([FromBody] ReorderRequest request)
        {
            try
            {
                await _transitionRulesDb.ReorderTransitionRulesAsync(request.RuleIds);
                return Ok();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TRANSITION_RULES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error in ReorderRules: {ex.Message}");
            }
        }

        // GET: api/transitionrules/5/dynamic-overrides
        [HttpGet("{id}/dynamic-overrides")]
        public async Task<ActionResult<IEnumerable<Model_TransitionRuleDynamicOverride>>> GetDynamicOverrides(int id)
        {
            try
            {
                var existing = await _transitionRulesDb.GetTransitionRuleByIdAsync(id);
                if (existing == null)
                {
                    return NotFound();
                }

                var overrides = await _transitionRulesDb.GetDynamicOverridesForRuleAsync(id);
                return Ok(overrides);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TRANSITION_RULES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error in GetDynamicOverrides: {ex.Message}");
            }
        }

        // PUT: api/transitionrules/5/dynamic-overrides
        [HttpPut("{id}/dynamic-overrides")]
        public async Task<IActionResult> UpdateDynamicOverrides(int id, [FromBody] List<Model_TransitionRuleDynamicOverride> overrides)
        {
            try
            {
                var existing = await _transitionRulesDb.GetTransitionRuleByIdAsync(id);
                if (existing == null)
                {
                    return NotFound();
                }

                await _transitionRulesDb.UpdateDynamicOverridesForRuleAsync(id, overrides);
                return Ok();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TRANSITION_RULES] {Request.Method} {Request.Path} failed: {ex.Message}");
                return StatusCode(500, $"Error in UpdateDynamicOverrides: {ex.Message}");
            }
        }

        public class ReorderRequest
        {
            public List<int> RuleIds { get; set; } = new();
        }
    }
}
