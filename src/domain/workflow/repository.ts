import type { WorkflowTransition } from "./entity";

export interface WorkflowRepository {
  listForTracker(trackerId: string): Promise<WorkflowTransition[]>;
  listForTrackerAndRole(trackerId: string, roleId: string): Promise<WorkflowTransition[]>;
  create(transition: Omit<WorkflowTransition, "id">): Promise<WorkflowTransition>;
  /**
   * Mirrors Redmine's WorkflowsController#edit — replaces the *entire* transition set
   * for this (tracker, role) pair with `transitions` in one operation. Scoped strictly to
   * the given tracker+role so it never touches any other pair's rows.
   */
  replaceForTrackerAndRole(
    trackerId: string,
    roleId: string,
    transitions: Array<Omit<WorkflowTransition, "id" | "trackerId" | "roleId">>,
  ): Promise<void>;
}
