import { NextResponse } from "next/server";
import { z } from "zod";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

// Mirrors Redmine's groups.json: GroupsController is gated on require_admin for every
// action except `show` — next-pm has no "visible group" concept outside admin (groups are
// an admin-only resource everywhere else in this codebase, e.g. admin/groups), so `show`
// stays admin-only too rather than introducing new scope.
export async function GET(request: Request) {
  const { user } = await resolveUser(request);
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const groups = await new DrizzleGroupRepository().listAll();
  return NextResponse.json({ groups });
}

const createGroupSchema = z.object({
  name: z.string().min(1).max(30),
});

export async function POST(request: Request) {
  const { user, viaCookie } = await resolveUser(request);
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const parsed = createGroupSchema.safeParse((await request.json().catch(() => null))?.group);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  try {
    const group = await new DrizzleGroupRepository().create(parsed.data.name);
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    const pgError = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    if (pgError instanceof Error && "code" in pgError && pgError.code === "23505") {
      return NextResponse.json({ error: "name_taken" }, { status: 422 });
    }
    throw error;
  }
}
