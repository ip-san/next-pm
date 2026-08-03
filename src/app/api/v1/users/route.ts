import { NextResponse } from "next/server";
import { z } from "zod";
import { generateSalt, hashPassword } from "@/domain/user/password";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

function toJson(user: { id: string; login: string; mail: string; firstname: string; lastname: string; isAdmin: boolean; status: string }) {
  return {
    id: user.id,
    login: user.login,
    mail: user.mail,
    firstname: user.firstname,
    lastname: user.lastname,
    admin: user.isAdmin,
    status: user.status,
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

  const users = await new DrizzleUserRepository().listAll();
  return NextResponse.json({ users: users.map(toJson) });
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
      mustChangePassword: true,
      apiKey: null,
      atomKey: null,
      authSource: null,
    });
    return NextResponse.json({ user: toJson(created) }, { status: 201 });
  } catch (error) {
    const pgError = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    if (pgError instanceof Error && "code" in pgError && pgError.code === "23505") {
      return NextResponse.json({ error: "mail_taken" }, { status: 422 });
    }
    throw error;
  }
}
