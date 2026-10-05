import type { EventAction, EventTrigger } from './entities';

/** A trigger as GET /api/eventrules/{id} returns it: the model plus its sensor's name. */
export type RuleTrigger = Omit<EventTrigger, 'createdAt'> & { triggerSensorName?: string | null };

/** An action as GET /api/eventrules/{id} returns it: the model plus its sensor's and junction's names. */
export type RuleAction = Omit<EventAction, 'createdAt'> & {
    actionTargetSensorName?: string | null;
    actionJunctionName?: string | null;
};

/** An event rule with its triggers and actions, names resolved (Controller_EventRules.EnrichRuleWithNames). */
export interface RuleDetail {
    id: number;
    name: string;
    description?: string | null;
    enabled: boolean;
    triggerLogic: string;
    triggers: RuleTrigger[];
    actions: RuleAction[];
    lastTriggered?: string | null;
    triggerCount: number;
}
