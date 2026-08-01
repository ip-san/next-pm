import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

// Mirrors Redmine's memberships.json: MembersController#index/#create are both gated on
// manage_members (lib/redmine/preparation.rb registers :members => [:index, ...] under that
// permission, require: :member) — unlike most list endpoints, viewing the member list itself
// requires the management permission, not just view_project.
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { user } = await resolveUser(request);
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_members", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const memberships = await new DrizzleMemberRepository().listByProject(project.id);
  return NextResponse.json({ memberships });
}

const createMembershipSchema = z.object({
  user_id: z.string().uuid(),
  role_ids: z.array(z.string().uuid()).min(1),
});

export async function POST(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_members", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = createMembershipSchema.safeParse((await request.json().catch(() => null))?.membership);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  const [targetUser, roles] = await Promise.all([
    new DrizzleUserRepository().findById(parsed.data.user_id),
    new DrizzleRoleRepository().findByIds(parsed.data.role_ids),
  ]);
  if (!targetUser) {
    return NextResponse.json({ error: "invalid_user_id" }, { status: 422 });
  }
  if (roles.length !== parsed.data.role_ids.length) {
    return NextResponse.json({ error: "invalid_role_ids" }, { status: 422 });
  }

  const memberRepository = new DrizzleMemberRepository();
  const existing = await memberRepository.findDirectByUserAndProject(targetUser.id, project.id);
  if (existing) {
    return NextResponse.json({ error: "already_a_member" }, { status: 422 });
  }

  const membership = await memberRepository.create({
    userId: targetUser.id,
    groupId: null,
    inheritedFromMemberId: null,
    projectId: project.id,
    roleIds: parsed.data.role_ids,
  });

  return NextResponse.json({ membership }, { status: 201 });
}
