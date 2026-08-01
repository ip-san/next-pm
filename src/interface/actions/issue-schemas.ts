import { z } from "zod";

/**
 * Kept out of issue-actions.ts on purpose: that file has "use server" at the top, and
 * Next.js's Server Actions compiler treats every export from such a file as an action
 * reference — a plain Zod schema export gets silently replaced with something that is
 * not a Zod schema by the time a client component imports it (zodResolver then throws
 * "Invalid input: not a Zod schema"). Schemas shared between client and server must live
 * in a non-"use server" module.
 */
export const createIssueFormSchema = z.object({
  projectId: z.string().uuid(),
  trackerId: z.string().uuid(),
  priorityId: z.string().uuid(),
  subject: z.string().min(1, "件名を入力してください。"),
  description: z.string(),
  /** A bare uuid (user) or "group:<uuid>" (group) — the "group:" prefix is stripped and validated server-side, since zod has no way to express "uuid, optionally prefixed" cleanly. */
  assignedToId: z.string(),
  categoryId: z.string().uuid().or(z.literal("")),
  fixedVersionId: z.string().uuid().or(z.literal("")),
  parentId: z.string().uuid().or(z.literal("")),
  isPrivate: z.boolean(),
  estimatedHours: z.string(),
  startDate: z.string(),
  dueDate: z.string(),
});

export type CreateIssueFormValues = z.infer<typeof createIssueFormSchema>;
