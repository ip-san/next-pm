import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveMailHandlerSettings } from "@/domain/settings/mail-handler-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { receiveEmail } from "@/interface/http/mail-handler";

/**
 * Redmine's MailHandlerController#index. Everything the reference `rdm-mailhandler.rb` script
 * submits is accepted here, under the same names, so the same script can post to this endpoint.
 * The dispatch itself lives in interface/http/mail-handler.ts.
 */
const requestSchema = z.object({
  key: z.string(),
  email: z.string(),
  allow_override: z.string().optional(),
  unknown_user: z.enum(["ignore", "accept", "create"]).optional(),
  default_group: z.string().optional(),
  no_account_notice: z.union([z.string(), z.boolean()]).optional(),
  no_notification: z.union([z.string(), z.boolean()]).optional(),
  no_permission_check: z.union([z.string(), z.boolean()]).optional(),
  project_from_subaddress: z.string().optional(),
  // `project` stays accepted at the top level: it is what next-pm's own handler took before
  // the Redmine-shaped `issue` hash existed, and dropping it would break existing callers.
  project: z.string().optional(),
  issue: z
    .object({
      project: z.string().optional(),
      status: z.string().optional(),
      tracker: z.string().optional(),
      category: z.string().optional(),
      priority: z.string().optional(),
      assigned_to: z.string().optional(),
      fixed_version: z.string().optional(),
      is_private: z.string().optional(),
    })
    .optional(),
});

/** Redmine's `'1' == value.to_s` option parsing. */
function flag(value: string | boolean | undefined): boolean {
  return value === true || value === "1";
}

/**
 * Constant-time key check — this endpoint has no session/API-key user auth of its own (mirrors
 * Redmine's mail_handler route, gated only by a shared secret compared with secure_compare).
 * The key comes from the `mail_handler_api_key` setting, falling back to MAIL_HANDLER_API_KEY
 * for deployments configured before that setting existed. Neither set means the feature is
 * disabled, never an always-accept key.
 */
function keyMatches(provided: string, configured: string): boolean {
  const expected = configured || process.env.MAIL_HANDLER_API_KEY || "";
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 422 });
  }

  const settings = resolveMailHandlerSettings(await new DrizzleSettingsRepository().getAll());
  if (!settings.apiEnabled || !keyMatches(parsed.data.key, settings.apiKey)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const issueDefaults = { ...parsed.data.issue };
  if (parsed.data.project && !issueDefaults.project) {
    issueDefaults.project = parsed.data.project;
  }

  const result = await receiveEmail(parsed.data.email, {
    allowOverride: parsed.data.allow_override,
    unknownUser: parsed.data.unknown_user,
    defaultGroup: parsed.data.default_group,
    noAccountNotice: flag(parsed.data.no_account_notice),
    noNotification: flag(parsed.data.no_notification),
    noPermissionCheck: flag(parsed.data.no_permission_check),
    projectFromSubaddress: parsed.data.project_from_subaddress,
    issue: issueDefaults,
    appOrigin: new URL(request.url).origin,
  });

  return NextResponse.json(result.body, { status: result.status });
}
