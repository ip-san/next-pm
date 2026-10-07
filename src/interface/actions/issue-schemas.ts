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
  doneRatio: z.string(),
  startDate: z.string(),
  dueDate: z.string(),
  /** customFieldId -> raw input; coerced and format-checked server-side by the custom-field domain. */
  customFieldValues: z.record(z.string(), z.string()),
});

export type CreateIssueFormValues = z.infer<typeof createIssueFormSchema>;

/**
 * Every attribute is optional on purpose: a field the workflow marks read-only (or that the
 * actor may not set at all) is never rendered, so the form omits its key entirely. An absent
 * key must read as "untouched" — the server merges only the keys it receives, and an empty
 * string means "cleared" only for the fields that are nullable to begin with.
 */
export const updateIssueFormSchema = z.object({
  issueId: z.string().uuid(),
  lockVersion: z.number().int(),
  trackerId: z.string().uuid().optional(),
  statusId: z.string().uuid().optional(),
  priorityId: z.string().uuid().optional(),
  subject: z.string().min(1, "件名を入力してください。").optional(),
  description: z.string().optional(),
  /** A bare uuid (user) or "group:<uuid>" (group); "" unassigns. */
  assignedToId: z.string().optional(),
  categoryId: z.string().uuid().or(z.literal("")).optional(),
  fixedVersionId: z.string().uuid().or(z.literal("")).optional(),
  parentId: z.string().uuid().or(z.literal("")).optional(),
  isPrivate: z.boolean().optional(),
  estimatedHours: z.string().optional(),
  doneRatio: z.string().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string(),
  customFieldValues: z.record(z.string(), z.string()),
});

export type UpdateIssueFormValues = z.infer<typeof updateIssueFormSchema>;

/** Single-issue move: destination project plus the tracker to land on (blank = Redmine's own fallback). */
export const moveIssueFormSchema = z.object({
  issueId: z.string().uuid(),
  targetProjectId: z.string().uuid(),
  targetTrackerId: z.string().uuid().or(z.literal("")),
});

export type MoveIssueFormValues = z.infer<typeof moveIssueFormSchema>;
