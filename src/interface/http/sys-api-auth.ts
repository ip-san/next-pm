import { isSysApiKeyValid, resolveSysApiSettings } from "@/domain/settings/sys-api";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";

/** Redmine's SysController#check_enabled, answered with the same plain-text 403. */
export const SYS_API_DENIED = new Response("Access denied. Repository management WS is disabled or key is invalid.", {
  status: 403,
  headers: { "Content-Type": "text/plain; charset=utf-8" },
});

/** True when the repository web service is enabled and the request's `key` matches the configured key. */
export async function sysApiAuthorized(request: Request): Promise<boolean> {
  const settings = resolveSysApiSettings(await new DrizzleSettingsRepository().getAll());
  return isSysApiKeyValid(settings, new URL(request.url).searchParams.get("key"));
}
