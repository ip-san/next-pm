import { NextResponse } from "next/server";
import { z } from "zod";
import { addUserToGroup } from "@/application/groups/group-membership";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

const addUserSchema = z.object({
  user_id: z.string().uuid(),
});

// Mirrors Redmine's groups/:id/users.json#create — adding a group member also materializes
// that user's inherited membership in every project the group already belongs to (see
// addUserToGroup), not just a group_users row.
export async function POST(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const groupRepository = new DrizzleGroupRepository();
  const group = await groupRepository.findById(groupId);
  if (!group) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = addUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  const targetUser = await new DrizzleUserRepository().findById(parsed.data.user_id);
  if (!targetUser) {
    return NextResponse.json({ error: "invalid_user_id" }, { status: 422 });
  }

  await addUserToGroup({ groupRepository, memberRepository: new DrizzleMemberRepository() }, groupId, targetUser.id);
  return new NextResponse(null, { status: 204 });
}
