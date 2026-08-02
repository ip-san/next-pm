import { NextResponse } from "next/server";
import { removeUserFromGroup } from "@/application/groups/group-membership";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

export async function DELETE(request: Request, { params }: { params: Promise<{ groupId: string; userId: string }> }) {
  const { groupId, userId } = await params;
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

  const memberUserIds = await groupRepository.listUserIds(groupId);
  if (!memberUserIds.includes(userId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await removeUserFromGroup({ groupRepository, memberRepository: new DrizzleMemberRepository() }, groupId, userId);
  return new NextResponse(null, { status: 204 });
}
