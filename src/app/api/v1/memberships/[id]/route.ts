import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import {
  MemberRolesEmptyError,
  MemberRolesInvalidError,
  updateMemberRoles,
  UpdateMemberRolesNotPermittedError,
} from "@/application/members/update-member-roles";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

const updateMembershipSchema = z.object({
  role_ids: z.array(z.string().uuid()),
});

/**
 * Redmine's MembersController#update (`accept_api_auth ... :update`). The role set is
 * replaced wholesale; the authorization, the group-inherited rule and the assignable-role
 * check all live in the use case.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const memberRepository = new DrizzleMemberRepository();
  const membership = await memberRepository.findById(id);
  if (!membership) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = updateMembershipSchema.safeParse((await request.json().catch(() => null))?.membership);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  const { actor } = await resolveActor(user, membership.projectId);
  try {
    await updateMemberRoles(
      {
        memberRepository,
        memberAdminRepository: memberRepository,
        projectRepository: new DrizzleProjectRepository(),
        roleRepository: new DrizzleRoleRepository(),
      },
      { memberId: id, roleIds: parsed.data.role_ids, actor },
    );
  } catch (error) {
    if (error instanceof UpdateMemberRolesNotPermittedError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error instanceof MemberRolesEmptyError || error instanceof MemberRolesInvalidError) {
      return NextResponse.json({ error: "invalid_request", detail: error.message }, { status: 422 });
    }
    throw error;
  }

  return new NextResponse(null, { status: 204 });
}

// The membership id is client-supplied, so the owning project is re-derived from the
// membership record itself rather than trusted from the URL/body — the same IDOR-safe
// pattern used by every other single-resource delete in this app (relations, attachments).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const memberRepository = new DrizzleMemberRepository();
  const membership = await memberRepository.findById(id);
  if (!membership) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const project = await new DrizzleProjectRepository().findById(membership.projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_members", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await memberRepository.delete(id);
  return new NextResponse(null, { status: 204 });
}
