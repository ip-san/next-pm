"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadMyPagePreferences } from "@/application/my-page/load-preferences";
import { isIssueQueryBlock, isMyPageBlockType, MY_PAGE_GROUPS, nextIssueQueryBlockId, type MyPageBlockType } from "@/domain/my-page/entity";
import { isQueryVisible } from "@/domain/query/visibility";
import { DrizzleQueryRepository } from "@/infrastructure/db/repositories/query-repository";
import { resolveGlobalIssueListScope } from "@/interface/http/global-issue-list";
import { addBlock, findBlockGroup, moveBlockToGroup, moveBlockWithinGroup, removeBlock } from "@/domain/my-page/layout";
import { DrizzleMyPageRepository } from "@/infrastructure/db/repositories/my-page-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { localizeError } from "@/interface/http/localize-error";

export type MyPageActionState = {
  error: string | null;
};

const blockSchema = z
  .string()
  .refine(isMyPageBlockType, "不正なブロックです。")
  .transform((value) => value as MyPageBlockType);

async function requireUserId(): Promise<{ userId: string } | { error: string }> {
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: await localizeError("ログインしてください。") };
  }
  return { userId: user.id };
}

export async function addMyPageBlockAction(_prevState: MyPageActionState, formData: FormData): Promise<MyPageActionState> {
  const parsed = blockSchema.safeParse(formData.get("block"));
  if (!parsed.success) {
    return { error: await localizeError("不正なブロックです。") };
  }
  const auth = await requireUserId();
  if ("error" in auth) return auth;

  const myPageRepository = new DrizzleMyPageRepository();
  const prefs = await loadMyPagePreferences(myPageRepository, auth.userId);
  // An issue-query block takes the next free id, so the page never holds two of the same.
  const block = isIssueQueryBlock(parsed.data) ? nextIssueQueryBlockId(Object.values(prefs.layout).flat()) : parsed.data;
  if (!block) {
    return { error: await localizeError("保存済みクエリのブロックは3つまでです。") };
  }
  await myPageRepository.save(auth.userId, { ...prefs, layout: addBlock(prefs.layout, block) });

  revalidatePath("/my");
  return { error: null };
}

export async function removeMyPageBlockAction(_prevState: MyPageActionState, formData: FormData): Promise<MyPageActionState> {
  const parsed = blockSchema.safeParse(formData.get("block"));
  if (!parsed.success) {
    return { error: await localizeError("不正なブロックです。") };
  }
  const auth = await requireUserId();
  if ("error" in auth) return auth;

  const myPageRepository = new DrizzleMyPageRepository();
  const prefs = await loadMyPagePreferences(myPageRepository, auth.userId);
  await myPageRepository.save(auth.userId, { ...prefs, layout: removeBlock(prefs.layout, parsed.data) });

  revalidatePath("/my");
  return { error: null };
}

const moveWithinGroupSchema = z.object({
  block: blockSchema,
  direction: z.enum(["up", "down"]),
});

export async function moveMyPageBlockAction(_prevState: MyPageActionState, formData: FormData): Promise<MyPageActionState> {
  const parsed = moveWithinGroupSchema.safeParse({ block: formData.get("block"), direction: formData.get("direction") });
  if (!parsed.success) {
    return { error: await localizeError("不正な操作です。") };
  }
  const auth = await requireUserId();
  if ("error" in auth) return auth;

  const myPageRepository = new DrizzleMyPageRepository();
  const prefs = await loadMyPagePreferences(myPageRepository, auth.userId);
  const group = findBlockGroup(prefs.layout, parsed.data.block);
  if (!group) {
    return { error: null };
  }
  await myPageRepository.save(auth.userId, { ...prefs, layout: moveBlockWithinGroup(prefs.layout, group, parsed.data.block, parsed.data.direction) });

  revalidatePath("/my");
  return { error: null };
}

const moveToGroupSchema = z.object({
  block: blockSchema,
  group: z.enum(MY_PAGE_GROUPS),
});

export async function moveMyPageBlockToGroupAction(_prevState: MyPageActionState, formData: FormData): Promise<MyPageActionState> {
  const parsed = moveToGroupSchema.safeParse({ block: formData.get("block"), group: formData.get("group") });
  if (!parsed.success) {
    return { error: await localizeError("不正な操作です。") };
  }
  const auth = await requireUserId();
  if ("error" in auth) return auth;

  const myPageRepository = new DrizzleMyPageRepository();
  const prefs = await loadMyPagePreferences(myPageRepository, auth.userId);
  await myPageRepository.save(auth.userId, { ...prefs, layout: moveBlockToGroup(prefs.layout, parsed.data.block, parsed.data.group) });

  revalidatePath("/my");
  return { error: null };
}

const updateTimelogDaysSchema = z.object({
  days: z.coerce.number().int(),
});

export async function updateTimelogDaysAction(_prevState: MyPageActionState, formData: FormData): Promise<MyPageActionState> {
  const parsed = updateTimelogDaysSchema.safeParse({ days: formData.get("days") });
  if (!parsed.success) {
    return { error: await localizeError("日数は整数で入力してください。") };
  }
  const auth = await requireUserId();
  if ("error" in auth) return auth;

  const myPageRepository = new DrizzleMyPageRepository();
  const prefs = await loadMyPagePreferences(myPageRepository, auth.userId);
  await myPageRepository.save(auth.userId, {
    ...prefs,
    blockSettings: { ...prefs.blockSettings, timelog: { ...prefs.blockSettings.timelog, days: parsed.data.days } },
  });

  revalidatePath("/my");
  return { error: null };
}

const issueQueryQueryIdSchema = z.string().uuid();

/**
 * Puts a saved issue query on an issue-query block. The query must be one the viewer may see right now, checked
 * here rather than trusted from the form (the same reason the list re-checks ?query_id=).
 */
export async function setIssueQueryBlockQueryAction(_prevState: MyPageActionState, formData: FormData): Promise<MyPageActionState> {
  const block = formData.get("block");
  if (typeof block !== "string" || !isIssueQueryBlock(block)) {
    return { error: await localizeError("不正なブロックです。") };
  }
  const queryId = issueQueryQueryIdSchema.safeParse(formData.get("queryId"));
  if (!queryId.success) {
    return { error: await localizeError("クエリを選んでください。") };
  }
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: await localizeError("ログインしてください。") };
  }
  const scope = await resolveGlobalIssueListScope(user);
  const queries = await new DrizzleQueryRepository().listAvailableFor(null, "IssueQuery");
  const query = queries.find((candidate) => candidate.id === queryId.data && (user.isAdmin || isQueryVisible(candidate, user.id, scope.roleIds)));
  if (!query) {
    return { error: await localizeError("そのクエリは選べません。") };
  }

  const myPageRepository = new DrizzleMyPageRepository();
  const prefs = await loadMyPagePreferences(myPageRepository, user.id);
  await myPageRepository.save(user.id, {
    ...prefs,
    blockSettings: { ...prefs.blockSettings, [block]: { queryId: query.id } },
  });

  revalidatePath("/my");
  return { error: null };
}
