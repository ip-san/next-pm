"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import type { FilterCondition } from "@/domain/query/filter-builder";
import type { SortCriterion } from "@/domain/query/sort";
import { copyQuery } from "@/application/queries/copy-query";
import { deleteQuery } from "@/application/queries/delete-query";
import { InvalidQueryError, QueryPermissionError, type QueryActor, type QuerySettings } from "@/application/queries/query-settings";
import { saveQuery } from "@/application/queries/save-query";
import { QueryNotFoundError, updateQuery } from "@/application/queries/update-query";
import type { QueryType } from "@/domain/query/entity";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleQueryRepository } from "@/infrastructure/db/repositories/query-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { listVisibleProjectContexts, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type SaveQueryActionState = {
  error: string | null;
};

const jsonArray = <T>(raw: FormDataEntryValue | null, fallback: T[]): T[] => {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
};

const queryTypeSchema = z.enum(["IssueQuery", "TimeEntryQuery"]).default("IssueQuery");

/** An absent/blank projectIdentifier is the global (cross-project) list — Redmine's `query_is_for_all`. */
const projectIdentifierSchema = z
  .string()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));

const settingsSchema = z.object({
  projectIdentifier: projectIdentifierSchema,
  type: queryTypeSchema,
  name: z.string().min(1),
  visibility: z.enum(["private", "roles", "public"]).default("private"),
});

/**
 * Where a query form returns to. Derived here rather than taken from the form, so a
 * submitted field can never turn these actions into an open redirect.
 */
function listPath(projectIdentifier: string | null, type: QueryType): string {
  if (type === "TimeEntryQuery") {
    return projectIdentifier ? `/projects/${projectIdentifier}/time-entries` : "/time_entries";
  }
  return projectIdentifier ? `/projects/${projectIdentifier}/issues` : "/issues";
}

/** `Query.view_permission` — what a user must hold before they may touch a query of this kind. */
function viewPermissionFor(type: QueryType) {
  return type === "TimeEntryQuery" ? ("view_time_entries" as const) : ("view_issues" as const);
}

/**
 * Resolves the caller and their query-related permissions for one project — or, when
 * `projectIdentifier` is null, globally. Every action below needs the same four facts, and
 * `Query.view_permission` is the baseline Redmine requires before a user may touch a query
 * of that kind at all.
 *
 * The global case is Redmine's `allowed_to?(permission, nil, :global => true)`: holding the
 * permission in *any* visible project is enough. `manage_public_queries` deliberately isn't
 * aggregated that way — a global public query is admin-only, which is what
 * `normalizeQuerySettings` enforces through its `projectId !== null` branch.
 */
async function resolveQueryActor(
  projectIdentifier: string | null,
  type: QueryType,
): Promise<{ error: string } | { actor: QueryActor; projectId: string | null; roleIds: string[] }> {
  const user = await currentUserFromCookies();
  if (!user) return { error: "ログインしてください。" };

  if (projectIdentifier === null) {
    const visible = await listVisibleProjectContexts(user, viewPermissionFor(type));
    if (visible.length === 0 && !user.isAdmin) {
      return { error: "この操作を行う権限がありません。" };
    }
    return {
      projectId: null,
      roleIds: [...new Set(visible.flatMap((entry) => entry.roleIds))],
      actor: {
        userId: user.id,
        isAdmin: user.isAdmin,
        canSaveQueries: visible.some((entry) => can({ permission: "save_queries", project: entry.projectContext, actor: entry.actor })),
        canManagePublicQueries: false,
      },
    };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(projectIdentifier);
  if (!project) return { error: "プロジェクトが見つかりません。" };

  const { actor, roleIds } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: viewPermissionFor(type), project: projectContext, actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  return {
    projectId: project.id,
    roleIds,
    actor: {
      userId: user.id,
      isAdmin: user.isAdmin,
      canSaveQueries: can({ permission: "save_queries", project: projectContext, actor }),
      canManagePublicQueries: can({ permission: "manage_public_queries", project: projectContext, actor }),
    },
  };
}

function settingsFromFormData(formData: FormData, name: string, visibility: QuerySettings["visibility"]): QuerySettings {
  return {
    name,
    visibility,
    roleIds: formData.getAll("roleIds").map(String),
    filters: jsonArray<FilterCondition>(formData.get("filters"), []),
    columnNames: jsonArray<string>(formData.get("columnNames"), []),
    groupBy: (formData.get("groupBy") as string | null) || null,
    sortCriteria: jsonArray<SortCriterion>(formData.get("sortCriteria"), []),
    totalableNames: jsonArray<string>(formData.get("totalableNames"), []),
  };
}

function toMessage(error: unknown): string {
  if (error instanceof InvalidQueryError || error instanceof QueryPermissionError || error instanceof QueryNotFoundError) {
    return error.message;
  }
  throw error;
}

/**
 * Saves the issue list's current filters, columns, grouping, sort and totals as a named
 * Query, reusing the exact shapes the list already renders from — no second representation.
 */
export async function saveQueryAction(_prevState: SaveQueryActionState, formData: FormData): Promise<SaveQueryActionState> {
  const parsed = settingsSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier") ?? undefined,
    type: formData.get("type") ?? undefined,
    name: formData.get("name"),
    visibility: formData.get("visibility") ?? "private",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const resolved = await resolveQueryActor(parsed.data.projectIdentifier, parsed.data.type);
  if ("error" in resolved) return { error: resolved.error };

  try {
    await saveQuery(
      { queryRepository: new DrizzleQueryRepository() },
      {
        projectId: resolved.projectId,
        type: parsed.data.type,
        settings: settingsFromFormData(formData, parsed.data.name, parsed.data.visibility),
        actor: resolved.actor,
      },
    );
  } catch (error) {
    return { error: toMessage(error) };
  }

  redirect(listPath(parsed.data.projectIdentifier, parsed.data.type));
}

export async function updateQueryAction(_prevState: SaveQueryActionState, formData: FormData): Promise<SaveQueryActionState> {
  const parsed = settingsSchema.extend({ queryId: z.string().uuid() }).safeParse({
    projectIdentifier: formData.get("projectIdentifier") ?? undefined,
    type: formData.get("type") ?? undefined,
    queryId: formData.get("queryId"),
    name: formData.get("name"),
    visibility: formData.get("visibility") ?? "private",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const resolved = await resolveQueryActor(parsed.data.projectIdentifier, parsed.data.type);
  if ("error" in resolved) return { error: resolved.error };

  try {
    await updateQuery(
      { queryRepository: new DrizzleQueryRepository() },
      {
        queryId: parsed.data.queryId,
        projectId: resolved.projectId,
        settings: settingsFromFormData(formData, parsed.data.name, parsed.data.visibility),
        actor: resolved.actor,
      },
    );
  } catch (error) {
    return { error: toMessage(error) };
  }

  redirect(`${listPath(parsed.data.projectIdentifier, parsed.data.type)}?query_id=${parsed.data.queryId}`);
}

export async function deleteQueryAction(_prevState: SaveQueryActionState, formData: FormData): Promise<SaveQueryActionState> {
  const parsed = z
    .object({ projectIdentifier: projectIdentifierSchema, type: queryTypeSchema, queryId: z.string().uuid() })
    .safeParse({
      projectIdentifier: formData.get("projectIdentifier") ?? undefined,
      type: formData.get("type") ?? undefined,
      queryId: formData.get("queryId"),
    });
  if (!parsed.success) {
    return { error: "入力内容を確認してください。" };
  }

  const resolved = await resolveQueryActor(parsed.data.projectIdentifier, parsed.data.type);
  if ("error" in resolved) return { error: resolved.error };

  try {
    await deleteQuery(
      { queryRepository: new DrizzleQueryRepository() },
      { queryId: parsed.data.queryId, projectId: resolved.projectId, actor: resolved.actor },
    );
  } catch (error) {
    return { error: toMessage(error) };
  }

  redirect(listPath(parsed.data.projectIdentifier, parsed.data.type));
}

export async function copyQueryAction(_prevState: SaveQueryActionState, formData: FormData): Promise<SaveQueryActionState> {
  const parsed = z
    .object({ projectIdentifier: projectIdentifierSchema, type: queryTypeSchema, queryId: z.string().uuid(), name: z.string().min(1) })
    .safeParse({
      projectIdentifier: formData.get("projectIdentifier") ?? undefined,
      type: formData.get("type") ?? undefined,
      queryId: formData.get("queryId"),
      name: formData.get("name"),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const resolved = await resolveQueryActor(parsed.data.projectIdentifier, parsed.data.type);
  if ("error" in resolved) return { error: resolved.error };

  try {
    await copyQuery(
      { queryRepository: new DrizzleQueryRepository() },
      {
        queryId: parsed.data.queryId,
        projectId: resolved.projectId,
        name: parsed.data.name,
        actor: resolved.actor,
        actorRoleIds: resolved.roleIds,
      },
    );
  } catch (error) {
    return { error: toMessage(error) };
  }

  redirect(listPath(parsed.data.projectIdentifier, parsed.data.type));
}
