import type { Positioned } from "@/domain/ordering/positioned";
import type { Tracker } from "./entity";

export interface TrackerRepository {
  findById(id: string): Promise<Tracker | null>;
  findByIds(ids: string[]): Promise<Tracker[]>;
  listAll(): Promise<Tracker[]>;
  create(tracker: Omit<Tracker, "id">): Promise<Tracker>;
}

/** Admin-screen writes — see IssueStatusAdminRepository for why these sit apart. */
export interface TrackerAdminRepository {
  update(
    id: string,
    changes: Pick<Tracker, "name" | "defaultStatusId" | "isInRoadmap" | "disabledCoreFields">,
  ): Promise<Tracker>;
  delete(id: string): Promise<void>;
  /** Count of issues with tracker_id = id — Tracker#check_integrity. */
  countIssuesUsing(id: string): Promise<number>;
  updatePositions(positions: Positioned[]): Promise<void>;
}
