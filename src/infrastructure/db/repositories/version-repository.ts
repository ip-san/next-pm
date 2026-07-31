import { count, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { issues } from "@/infrastructure/db/schema/issues";
import { projects } from "@/infrastructure/db/schema/projects";
import { versions } from "@/infrastructure/db/schema/versions";
import { isVersionSharedWith } from "@/domain/version/sharing";
import type { Version, VersionSharing, VersionStatus } from "@/domain/version/entity";
import type { VersionRepository } from "@/domain/version/repository";

type ProjectNode = { id: string; lft: number; rgt: number; parentId: string | null };

function toDomain(row: typeof versions.$inferSelect): Version {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    effectiveDate: row.effectiveDate,
    status: row.status as VersionStatus,
    sharing: row.sharing as VersionSharing,
    wikiPageTitle: row.wikiPageTitle,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The outermost ancestor of `node` in its nested-set tree (itself, if it has no parent). */
function findTreeRoot(node: ProjectNode, roots: ProjectNode[]): ProjectNode {
  return roots.find((root) => root.lft <= node.lft && root.rgt >= node.rgt) ?? node;
}

export class DrizzleVersionRepository implements VersionRepository {
  async listByProject(projectId: string): Promise<Version[]> {
    const rows = await db.select().from(versions).where(eq(versions.projectId, projectId)).orderBy(versions.effectiveDate, versions.name);
    return rows.map(toDomain);
  }

  async listSharedWith(projectId: string): Promise<Version[]> {
    const allProjects = await db.select({ id: projects.id, lft: projects.lft, rgt: projects.rgt, parentId: projects.parentId }).from(projects);
    const target = allProjects.find((p) => p.id === projectId);
    if (!target) {
      return [];
    }

    const roots = allProjects.filter((p) => p.parentId === null);
    const targetRoot = findTreeRoot(target, roots);
    const projectById = new Map(allProjects.map((p) => [p.id, p]));

    const allVersions = await db.select().from(versions);
    const shared = allVersions.filter((row) => {
      const owner = projectById.get(row.projectId);
      if (!owner) {
        return false;
      }
      const ownerRoot = findTreeRoot(owner, roots);
      return isVersionSharedWith(owner, target, row.sharing as VersionSharing, ownerRoot, targetRoot);
    });

    return shared.map(toDomain).sort((a, b) => (a.effectiveDate ?? "9999-99-99").localeCompare(b.effectiveDate ?? "9999-99-99") || a.name.localeCompare(b.name));
  }

  async findById(id: string): Promise<Version | null> {
    const [row] = await db.select().from(versions).where(eq(versions.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async create(input: Omit<Version, "id" | "createdAt" | "updatedAt">): Promise<Version> {
    const [row] = await db
      .insert(versions)
      .values({
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        effectiveDate: input.effectiveDate,
        status: input.status,
        sharing: input.sharing,
        wikiPageTitle: input.wikiPageTitle,
      })
      .returning();
    return toDomain(row);
  }

  async update(
    id: string,
    changes: Partial<Pick<Version, "name" | "description" | "effectiveDate" | "status" | "sharing" | "wikiPageTitle">>,
  ): Promise<Version> {
    const [row] = await db
      .update(versions)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(versions.id, id))
      .returning();
    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await db.delete(versions).where(eq(versions.id, id));
  }

  async countFixedIssues(id: string): Promise<number> {
    const [row] = await db.select({ value: count() }).from(issues).where(eq(issues.fixedVersionId, id));
    return row?.value ?? 0;
  }
}
