import { createHash } from "node:crypto";

/**
 * Mirrors Redmine's GravatarHelper: the MD5 of the lowercased, trimmed address, with
 * `d=identicon` so an address with no Gravatar still gets a distinct generated image rather
 * than the default silhouette (Redmine's gravatar_default setting, whose default is
 * "identicon" too).
 *
 * MD5 here is not a security choice — it is Gravatar's URL format, and there is no option.
 *
 * Note this does disclose a hash of the address to gravatar.com on every render, which is why
 * the whole thing is behind Setting.gravatar_enabled and that setting defaults to off.
 */
export function gravatarUrl(mail: string, size?: number): string {
  const hash = createHash("md5").update(mail.trim().toLowerCase()).digest("hex");
  const sizeParam = size === undefined ? "" : `s=${size}&`;
  return `https://www.gravatar.com/avatar/${hash}?${sizeParam}d=identicon`;
}

/**
 * The `avatar_url` of Redmine's user JSON (users/show.api.rsb, users/index.api.rsb): the Gravatar URL
 * with no size, present only while the Gravatar setting is on. `undefined` leaves the key out of
 * the JSON, which is how the API omits it.
 */
export function avatarUrlFor(mail: string, gravatarEnabled: boolean): string | undefined {
  return gravatarEnabled ? gravatarUrl(mail) : undefined;
}

/** Redmine's `initials` helper, used as the local fallback when Gravatar is switched off. */
export function userInitials(firstname: string, lastname: string): string {
  return `${(lastname[0] ?? "").toUpperCase()}${(firstname[0] ?? "").toUpperCase()}` || "?";
}
