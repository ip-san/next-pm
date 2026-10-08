import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { projects } from "@/infrastructure/db/schema/projects";
import { attachments } from "@/infrastructure/db/schema/attachments";
import { boards } from "@/infrastructure/db/schema/boards";
import { customValues } from "@/infrastructure/db/schema/custom-values";
import { documents } from "@/infrastructure/db/schema/documents";
import { enabledModules } from "@/infrastructure/db/schema/enabled-modules";
import { issueCategories } from "@/infrastructure/db/schema/issue-categories";
import { issues } from "@/infrastructure/db/schema/issues";
import { journals } from "@/infrastructure/db/schema/journals";
import { memberRoles, members } from "@/infrastructure/db/schema/members";
import { messages } from "@/infrastructure/db/schema/messages";
import { news } from "@/infrastructure/db/schema/news";
import { reactions } from "@/infrastructure/db/schema/reactions";
import { projectTrackers } from "@/infrastructure/db/schema/trackers";
import { versions } from "@/infrastructure/db/schema/versions";
import { watchers } from "@/infrastructure/db/schema/watchers";
import { wikiPages } from "@/infrastructure/db/schema/wiki";
import type { Project, ProjectStatus } from "@/domain/project/entity";
import { ProjectHasSubprojectsError, type ProjectRepository, type ProjectSettingsUpdate } from "@/domain/project/repository";
import { isWithinSubtree, planDelete, planInsert, type NestedSetNode } from "@/domain/project/nested-set";

/**
 * The polymorphic containers living inside a project subtree, as `[containerType, ids]`
 * pairs — the shape the five type+id tables (attachments, custom_values, watchers,
 * reactions, journals) are keyed by. "Project" itself is in the list because the Files
 * module attaches to a project directly.
 */
async function containersInSubtree(
  tx: Pick<typeof db, "select">,
  projectIds: string[],
): Promise<[string, string[]][]> {
  const idsOf = async <T extends { id: string }>(rows: Promise<T[]>): Promise<string[]> => (await rows).map((row) => row.id);

  // Sequential, not Promise.all: `tx` is a single pg client, and issuing concurrent queries
  // on one is deprecated in pg 8 and gone in pg 9.
  const issueIds = await idsOf(tx.select({ id: issues.id }).from(issues).where(inArray(issues.projectId, projectIds)));
  const versionIds = await idsOf(tx.select({ id: versions.id }).from(versions).where(inArray(versions.projectId, projectIds)));
  const newsIds = await idsOf(tx.select({ id: news.id }).from(news).where(inArray(news.projectId, projectIds)));
  const documentIds = await idsOf(tx.select({ id: documents.id }).from(documents).where(inArray(documents.projectId, projectIds)));
  const wikiPageIds = await idsOf(tx.select({ id: wikiPages.id }).from(wikiPages).where(inArray(wikiPages.projectId, projectIds)));
  const boardIds = await idsOf(tx.select({ id: boards.id }).from(boards).where(inArray(boards.projectId, projectIds)));
  const messageIds =
    boardIds.length > 0 ? await idsOf(tx.select({ id: messages.id }).from(messages).where(inArray(messages.boardId, boardIds))) : [];

  return (
    [
      ["Project", projectIds],
      ["Issue", issueIds],
      ["Version", versionIds],
      ["News", newsIds],
      ["Document", documentIds],
      ["WikiPage", wikiPageIds],
      ["Message", messageIds],
    ] as [string, string[]][]
  ).filter(([, ids]) => ids.length > 0);
}

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

  async updateSettings(id: string, settings: ProjectSettingsUpdate): Promise<Project> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(projects)
        .set({ name: settings.name, description: settings.description, isPublic: settings.isPublic })
        .where(eq(projects.id, id))
        .returning();
      if (!row) {
        throw new Error(`Project ${id} not found`);
      }

      await tx.delete(enabledModules).where(eq(enabledModules.projectId, id));
      if (settings.enabledModules.length > 0) {
        await tx.insert(enabledModules).values(settings.enabledModules.map((name) => ({ projectId: id, name })));
      }

      await tx.delete(projectTrackers).where(eq(projectTrackers.projectId, id));
      if (settings.trackerIds.length > 0) {
        await tx.insert(projectTrackers).values(settings.trackerIds.map((trackerId) => ({ projectId: id, trackerId })));
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
        enabledModules: settings.enabledModules,
        trackerIds: settings.trackerIds,
      };
    });
  }

  async updateStatus(projectIds: string[], status: ProjectStatus): Promise<void> {
    if (projectIds.length === 0) return;
    await db.update(projects).set({ status }).where(inArray(projects.id, projectIds));
  }

  async deleteSubtree(
    rootProjectId: string,
    options: { allowNonLeaf: boolean },
  ): Promise<{ removedProjectIds: string[]; attachmentStorageKeys: string[] }> {
    return db.transaction(async (tx) => {
      // FOR UPDATE on every project row, inside the transaction: the plan must be built from
      // the tree as it is now, and the lock keeps it that way — a concurrent child insert
      // needs a key-share lock on its parent row, which this conflicts with.
      const nodes = await tx
        .select({ id: projects.id, lft: projects.lft, rgt: projects.rgt })
        .from(projects)
        .for("update");
      const root = nodes.find((node) => node.id === rootProjectId);
      if (!root) {
        throw new Error(`Project ${rootProjectId} not found`);
      }

      const plan = planDelete(nodes, root);
      if (!options.allowNonLeaf && plan.removed.length > 1) {
        throw new ProjectHasSubprojectsError();
      }
      const removedProjectIds = plan.removed.map((node) => node.id);
      const shifted = plan.shifted;

      const containers = await containersInSubtree(tx, removedProjectIds);

      const attachmentStorageKeys: string[] = [];
      for (const [containerType, ids] of containers) {
        const rows = await tx
          .select({ storageKey: attachments.storageKey })
          .from(attachments)
          .where(and(eq(attachments.containerType, containerType), inArray(attachments.containerId, ids)));
        attachmentStorageKeys.push(...rows.map((row) => row.storageKey));
      }

      // Journals first, and their reactions before them: a reaction points at a journal,
      // which points at an issue, and none of those three links is a foreign key.
      for (const [containerType, ids] of containers) {
        const journalRows = await tx
          .select({ id: journals.id })
          .from(journals)
          .where(and(eq(journals.journalizedType, containerType), inArray(journals.journalizedId, ids)));
        const journalIds = journalRows.map((row) => row.id);
        if (journalIds.length > 0) {
          await tx.delete(reactions).where(and(eq(reactions.reactableType, "Journal"), inArray(reactions.reactableId, journalIds)));
          // journal_details go with the journal via its own cascade.
          await tx.delete(journals).where(inArray(journals.id, journalIds));
        }
      }

      for (const [containerType, ids] of containers) {
        await tx.delete(attachments).where(and(eq(attachments.containerType, containerType), inArray(attachments.containerId, ids)));
        await tx.delete(customValues).where(and(eq(customValues.customizedType, containerType), inArray(customValues.customizedId, ids)));
        await tx.delete(watchers).where(and(eq(watchers.watchableType, containerType), inArray(watchers.watchableId, ids)));
      }

      // Deepest first — projects.parent_id is ON DELETE RESTRICT, so a parent cannot go
      // before its children. Everything else hanging off a project is ON DELETE CASCADE.
      for (const projectId of removedProjectIds) {
        await tx.delete(projects).where(eq(projects.id, projectId));
      }

      for (const node of shifted) {
        await tx.update(projects).set({ lft: node.lft, rgt: node.rgt }).where(eq(projects.id, node.id));
      }

      return { removedProjectIds, attachmentStorageKeys };
    });
  }

  async copySkeletonFrom(
    sourceProjectId: string,
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
        await tx.insert(enabledModules).values(project.enabledModules.map((name) => ({ projectId: row.id, name })));
      }
      if (project.trackerIds.length > 0) {
        await tx.insert(projectTrackers).values(project.trackerIds.map((trackerId) => ({ projectId: row.id, trackerId })));
      }

      // Direct (non-inherited) user-principal members only — see the interface doc comment
      // for why group members and inherited rows are out of scope here.
      const sourceMembers = await tx
        .select({ id: members.id, userId: members.userId })
        .from(members)
        .where(and(eq(members.projectId, sourceProjectId), isNull(members.inheritedFromMemberId), isNotNull(members.userId)));
      for (const sourceMember of sourceMembers) {
        const roleRows = await tx.select({ roleId: memberRoles.roleId }).from(memberRoles).where(eq(memberRoles.memberId, sourceMember.id));
        if (roleRows.length === 0) continue;
        const [newMember] = await tx
          .insert(members)
          .values({ userId: sourceMember.userId, groupId: null, inheritedFromMemberId: null, projectId: row.id })
          .returning({ id: members.id });
        await tx.insert(memberRoles).values(roleRows.map((r) => ({ memberId: newMember.id, roleId: r.roleId })));
      }

      const sourceCategories = await tx
        .select({ name: issueCategories.name, assignedToId: issueCategories.assignedToId })
        .from(issueCategories)
        .where(eq(issueCategories.projectId, sourceProjectId));
      if (sourceCategories.length > 0) {
        await tx.insert(issueCategories).values(sourceCategories.map((c) => ({ ...c, projectId: row.id })));
      }

      const sourceVersions = await tx
        .select({
          name: versions.name,
          description: versions.description,
          effectiveDate: versions.effectiveDate,
          status: versions.status,
          sharing: versions.sharing,
          wikiPageTitle: versions.wikiPageTitle,
        })
        .from(versions)
        .where(eq(versions.projectId, sourceProjectId));
      if (sourceVersions.length > 0) {
        await tx.insert(versions).values(sourceVersions.map((v) => ({ ...v, projectId: row.id })));
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
