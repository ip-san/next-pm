import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { projects } from "@/infrastructure/db/schema/projects";
import { enabledModules } from "@/infrastructure/db/schema/enabled-modules";
import { projectTrackers } from "@/infrastructure/db/schema/trackers";
import type { Project } from "@/domain/project/entity";
import type { ProjectRepository } from "@/domain/project/repository";
import { isWithinSubtree, planInsert, type NestedSetNode } from "@/domain/project/nested-set";

async function attachRelations(
  rows: (typeof projects.$inferSelect)[],
): Promise<Project[]> {
  const result: Project[] = [];
  for (const row of rows) {
    const [moduleRows, trackerRows] = await Promise.all([
      db.select({ name: enabledModules.name }).from(enabledModules).where(eq(enabledModules.projectId, row.id)),
      db
        .select({ trackerId: projectTrackers.trackerId })
        .from(projectTrackers)
        .where(eq(projectTrackers.projectId, row.id)),
    ]);
    result.push({
      id: row.id,
      name: row.name,
      identifier: row.identifier,
      description: row.description,
      isPublic: row.isPublic,
      status: row.status,
      parentId: row.parentId,
      lft: row.lft,
      rgt: row.rgt,
      position: row.position,
      enabledModules: moduleRows.map((m) => m.name),
      trackerIds: trackerRows.map((t) => t.trackerId),
    });
  }
  return result;
}

export class DrizzleProjectRepository implements ProjectRepository {
  async findById(id: string): Promise<Project | null> {
    const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!row) return null;
    const [withRelations] = await attachRelations([row]);
    return withRelations;
  }

  async findByIdentifier(identifier: string): Promise<Project | null> {
    const [row] = await db.select().from(projects).where(eq(projects.identifier, identifier)).limit(1);
    if (!row) return null;
    const [withRelations] = await attachRelations([row]);
    return withRelations;
  }

  async listAll(): Promise<Project[]> {
    const rows = await db.select().from(projects).orderBy(projects.lft);
    return attachRelations(rows);
  }

  async listNestedSetNodes(): Promise<NestedSetNode[]> {
    const rows = await db.select({ id: projects.id, lft: projects.lft, rgt: projects.rgt }).from(projects);
    return rows;
  }

  async listDescendants(projectId: string): Promise<Project[]> {
    const all = await this.listAll();
    const ancestor = all.find((p) => p.id === projectId);
    if (!ancestor) return [];
    return all.filter((p) => p.id !== projectId && isWithinSubtree(ancestor, p));
  }

  async createUnderParent(
    project: Omit<Project, "id" | "lft" | "rgt">,
    parentId: string | null,
  ): Promise<Project> {
    return db.transaction(async (tx) => {
      const nodes = await tx.select({ id: projects.id, lft: projects.lft, rgt: projects.rgt }).from(projects);
      const parent = parentId ? nodes.find((n) => n.id === parentId) ?? null : null;
      if (parentId && !parent) {
        throw new Error(`Parent project ${parentId} not found`);
      }

      const plan = planInsert(nodes, parent);

      for (const node of plan.shifted) {
        const original = nodes.find((n) => n.id === node.id);
        if (original && (original.lft !== node.lft || original.rgt !== node.rgt)) {
          await tx.update(projects).set({ lft: node.lft, rgt: node.rgt }).where(eq(projects.id, node.id));
        }
      }

      const [row] = await tx
        .insert(projects)
        .values({
          name: project.name,
          identifier: project.identifier,
          description: project.description,
          isPublic: project.isPublic,
          status: project.status,
          parentId,
          lft: plan.newNode.lft,
          rgt: plan.newNode.rgt,
          position: project.position,
        })
        .returning();

      if (project.enabledModules.length > 0) {
        await tx
          .insert(enabledModules)
          .values(project.enabledModules.map((name) => ({ projectId: row.id, name })));
      }
      if (project.trackerIds.length > 0) {
        await tx
          .insert(projectTrackers)
          .values(project.trackerIds.map((trackerId) => ({ projectId: row.id, trackerId })));
      }

      return {
        id: row.id,
        name: row.name,
        identifier: row.identifier,
        description: row.description,
        isPublic: row.isPublic,
        status: row.status,
        parentId: row.parentId,
        lft: row.lft,
        rgt: row.rgt,
        position: row.position,
        enabledModules: project.enabledModules,
        trackerIds: project.trackerIds,
      };
    });
  }
}
