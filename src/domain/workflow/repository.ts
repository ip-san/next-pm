import type { WorkflowTransition } from "./entity";

export interface WorkflowRepository {
  listForTracker(trackerId: string): Promise<WorkflowTransition[]>;
  create(transition: Omit<WorkflowTransition, "id">): Promise<WorkflowTransition>;
}
