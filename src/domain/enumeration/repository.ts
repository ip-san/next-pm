import type { Positioned } from "@/domain/ordering/positioned";
import type { Enumeration, EnumerationType } from "./entity";

export interface EnumerationRepository {
  listByType(type: EnumerationType): Promise<Enumeration[]>;
  create(enumeration: Omit<Enumeration, "id">): Promise<Enumeration>;
  /** Mirrors Enumeration#check_default — clears the system-wide default flag for `type` so a new default stays unique. */
  unsetSystemDefaultsForType(type: EnumerationType): Promise<void>;
}

/** Admin-screen writes — see IssueStatusAdminRepository for why these sit apart. */
export interface EnumerationAdminRepository {
  findById(id: string): Promise<Enumeration | null>;
  update(id: string, changes: Pick<Enumeration, "name" | "isDefault">): Promise<Enumeration>;
  delete(id: string): Promise<void>;
  /**
   * Mirrors each Enumeration subclass's `objects_count`: issues for IssuePriority, documents
   * for DocumentCategory, and — for TimeEntryActivity — time entries on the row *and its direct
   * project overrides*, because TimeEntryActivity#objects spans `self_and_descendants(1)`.
   */
  countObjectsUsing(enumeration: Pick<Enumeration, "id" | "type">): Promise<number>;
  /** Mirrors `transfer_relations`, over the same rows `countObjectsUsing` counts. */
  transferRelations(enumeration: Pick<Enumeration, "id" | "type">, toId: string): Promise<void>;
  updatePositions(positions: Positioned[]): Promise<void>;
}
