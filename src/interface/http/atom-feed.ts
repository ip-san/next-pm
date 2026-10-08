import { NextResponse } from "next/server";
import { isActiveUser, type User } from "@/domain/user/entity";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";

/**
 * Mirrors Redmine's `atom_key` (`accept_atom_auth`): a feed reader can't carry a session
 * cookie or set custom headers, so it authenticates via a token embedded in the feed URL
 * itself.
 *
 * Deliberately NOT the general apiKey — query strings end up in server logs, browser
 * history and proxy caches, so a leak here must only expose read-only feed content, never
 * the full REST API access apiKey grants. atomKey is a separate, narrowly-scoped token.
 */
export async function resolveAtomUser(url: URL): Promise<User | null> {
  const viaCookie = await currentUserFromCookies();
  if (viaCookie) return viaCookie;

  const key = url.searchParams.get("key");
  if (!key) return null;
  // Redmine's User.find_by_atom_key goes through Token.find_active_user, so a locked
  // account's feed key stops working too.
  const user = await new DrizzleUserRepository().findByAtomKey(key);
  return user && isActiveUser(user) ? user : null;
}

/** The response shape every Atom route shares, including the header that keeps the key out of referers. */
export function atomResponse(xml: string): NextResponse {
  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      // The feed URL carries the reader's atomKey in its query string — never send it as a
      // Referer header if a feed reader follows a link out from this response.
      "Referrer-Policy": "no-referrer",
    },
  });
}
