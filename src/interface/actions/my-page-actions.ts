"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadMyPagePreferences } from "@/application/my-page/load-preferences";
import { MY_PAGE_BLOCK_TYPES, MY_PAGE_GROUPS } from "@/domain/my-page/entity";
import { addBlock, findBlockGroup, moveBlockToGroup, moveBlockWithinGroup, removeBlock } from "@/domain/my-page/layout";
import { DrizzleMyPageRepository } from "@/infrastructure/db/repositories/my-page-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";

export type MyPageActionState = {
  error: string | null;
};

const blockSchema = z.enum(MY_PAGE_BLOCK_TYPES);

async function requireUserId(): Promise<{ userId: string } | { error: string }> {
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }
  return { userId: user.id };
}

export async function addMyPageBlockAction(_prevState: MyPageActionState, formData: FormData): Promise<MyPageActionState> {
  const parsed = blockSchema.safeParse(formData.get("block"));
  if (!parsed.success) {
    return { error: "不正なブロックです。" };
  }
  const auth = await requireUserId();
  if ("error" in auth) return auth;

  const myPageRepository = new DrizzleMyPageRepository();
  const prefs = await loadMyPagePreferences(myPageRepository, auth.userId);
  await myPageRepository.save(auth.userId, { ...prefs, layout: addBlock(prefs.layout, parsed.data) });

  revalidatePath("/my");
  return { error: null };
}

export async function removeMyPageBlockAction(_prevState: MyPageActionState, formData: FormData): Promise<MyPageActionState> {
  const parsed = blockSchema.safeParse(formData.get("block"));
  if (!parsed.success) {
    return { error: "不正なブロックです。" };
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
    return { error: "不正な操作です。" };
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
    return { error: "不正な操作です。" };
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
    return { error: "日数は整数で入力してください。" };
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
