"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";

export type AdminActionState = {
  error: string | null;
};

async function requireAdmin(): Promise<string | null> {
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    return "この操作を行う権限がありません。";
  }
  return null;
}

const createIssueStatusSchema = z.object({
  name: z.string().min(1).max(30),
  isClosed: z.coerce.boolean().default(false),
});

export async function createIssueStatusAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = createIssueStatusSchema.safeParse({
    name: formData.get("name"),
    isClosed: formData.get("isClosed") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  await new DrizzleIssueStatusRepository().create({
    name: parsed.data.name,
    description: "",
    isClosed: parsed.data.isClosed,
    defaultDoneRatio: null,
    position: 0,
  });

  revalidatePath("/admin/issue-statuses");
  return { error: null };
}

const createTrackerSchema = z.object({
  name: z.string().min(1),
  defaultStatusId: z.string().uuid("既定のステータスを選択してください。"),
});

export async function createTrackerAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = createTrackerSchema.safeParse({
    name: formData.get("name"),
    defaultStatusId: formData.get("defaultStatusId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  await new DrizzleTrackerRepository().create({
    name: parsed.data.name,
    defaultStatusId: parsed.data.defaultStatusId,
    position: 0,
    isInRoadmap: true,
  });

  revalidatePath("/admin/trackers");
  return { error: null };
}
