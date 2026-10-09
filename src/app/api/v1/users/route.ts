import { NextResponse } from "next/server";
import { z } from "zod";
import { loadAuthSettings } from "@/application/settings/auth-settings";
import { avatarUrlFor } from "@/domain/user/avatar";
import { generateSalt, hashPassword } from "@/domain/user/password";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { verifyCsrf } from "@/interface/http/csrf";
import { paginate, parsePagination } from "@/interface/http/pagination";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

function toJson(
  user: { id: string; login: string; mail: string; firstname: string; lastname: string; isAdmin: boolean; status: string },
  gravatarEnabled: boolean,
) {
  return {
    id: user.id,
    login: user.login,
    mail: user.mail,
    firstname: user.firstname,
    lastname: user.lastname,
    admin: user.isAdmin,
    status: user.status,
    avatar_url: avatarUrlFor(user.mail, gravatarEnabled),
  };
}

// Mirrors Redmine's UsersController#index, which requires admin (users.json is a
// management endpoint, not a general "who's on this project" lookup — that's
// memberships.json instead).
export async function GET(request: Request) {
  const { user } = await resolveUser(request);
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const allUsers = await new DrizzleUserRepository().listAll();
  const { gravatarEnabled } = await loadAuthSettings(new DrizzleSettingsRepository());
  const { items: users, total_count, offset, limit } = paginate(allUsers, parsePagination(new URL(request.url)));
  return NextResponse.json({ users: users.map((user) => toJson(user, gravatarEnabled)), total_count, offset, limit });
}

const createUserSchema = z.object({
  login: z.string().min(1).max(30),
  mail: z.string().email(),
  firstname: z.string().min(1),
  lastname: z.string().min(1),
  password: z.string().min(8),
  admin: z.boolean().default(false),
});

export async function POST(request: Request) {
  const { user, viaCookie } = await resolveUser(request);
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const parsed = createUserSchema.safeParse((await request.json().catch(() => null))?.user);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  const userRepository = new DrizzleUserRepository();
  const existing = await userRepository.findByLogin(parsed.data.login);
  if (existing) {
    return NextResponse.json({ error: "login_taken" }, { status: 422 });
  }
  // users.mail's unique constraint no longer covers every address: an address may be held as
  // someone's additional address in email_addresses. findByMail searches both tables.
  if (await userRepository.findByMail(parsed.data.mail)) {
    return NextResponse.json({ error: "mail_taken" }, { status: 422 });
  }

  const salt = generateSalt();
  try {
    const created = await userRepository.create({
      login: parsed.data.login,
      mail: parsed.data.mail,
      firstname: parsed.data.firstname,
      lastname: parsed.data.lastname,
      isAdmin: parsed.data.admin,
      status: "active",
      passwordSalt: salt,
      passwordHash: hashPassword(parsed.data.password, salt),
      language: null,
      mailNotification: "all",
      mustChangePassword: true,
      apiKey: null,
      atomKey: null,
      authSource: null,
      ldapAuthSourceId: null,
      twofaScheme: null,
      twofaTotpKey: null,
      twofaTotpLastUsedStep: null,
    });
    const { gravatarEnabled } = await loadAuthSettings(new DrizzleSettingsRepository());
    return NextResponse.json({ user: toJson(created, gravatarEnabled) }, { status: 201 });
  } catch (error) {
    const pgError = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    if (pgError instanceof Error && "code" in pgError && pgError.code === "23505") {
      return NextResponse.json({ error: "mail_taken" }, { status: 422 });
    }
    throw error;
  }
}
