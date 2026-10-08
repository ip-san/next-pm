import type { Enumeration } from "./entity";

/**
 * The project-scoped half of the enumerations table, kept apart from `EnumerationRepository`
 * so the test mocks of that port (and of the admin one beside it) don't have to grow methods
 * they never call. Only TimeEntryActivity rows are reachable through it — the only
 * enumeration type Redmine lets a project override (ProjectEnumerationsController).
 */
export interface ProjectActivityRepository {
  /** This project's override rows (`project_id = projectId`), active or not. */
  listOverridesForProject(projectId: string): Promise<Enumeration[]>;
  /** Creates an override of `parent` for this project, copying the parent's name and position. */
  createOverride(input: { projectId: string; parent: Enumeration; active: boolean }): Promise<Enumeration>;
  updateOverride(id: string, changes: { active: boolean }): Promise<void>;
  /**
   * Deletes the override. The caller must have moved this project's time entries back to the
   * parent first — `time_entries.activity_id` has no ON DELETE action, so the delete would
   * otherwise be refused by the database.
   */
  deleteOverride(id: string): Promise<void>;
  /**
   * Moves this project's time entries from one activity to another, mirroring Redmine's
   * `time_entries.where(activity_id: ...).update_all` on create and
   * `Enumeration#destroy(reassign_to)` -> `transfer_relations` on reset.
   */
  reassignTimeEntries(projectId: string, fromActivityId: string, toActivityId: string): Promise<void>;
}
