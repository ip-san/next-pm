import type { Project } from "./entity";
import type { NestedSetNode } from "./nested-set";

export interface ProjectRepository {
  findById(id: string): Promise<Project | null>;
  findByIdentifier(identifier: string): Promise<Project | null>;
  listAll(): Promise<Project[]>;
  listNestedSetNodes(): Promise<NestedSetNode[]>;
  /** Persists a new project as the rightmost child of `parentId` (or a new root if null). */
  createUnderParent(
    project: Omit<Project, "id" | "lft" | "rgt">,
    parentId: string | null,
  ): Promise<Project>;
}
