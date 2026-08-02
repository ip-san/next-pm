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

export async function GET(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const { user } = await resolveUser(request);
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const group = await new DrizzleGroupRepository().findById(groupId);
  if (!group) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ group });
}

const updateGroupSchema = z.object({
  name: z.string().min(1).max(30),
});

export async function PUT(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const groupRepository = new DrizzleGroupRepository();
  const existing = await groupRepository.findById(groupId);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = updateGroupSchema.safeParse((await request.json().catch(() => null))?.group);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  try {
    await groupRepository.rename(groupId, parsed.data.name);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const pgError = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    if (pgError instanceof Error && "code" in pgError && pgError.code === "23505") {
      return NextResponse.json({ error: "name_taken" }, { status: 422 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const groupRepository = new DrizzleGroupRepository();
  const existing = await groupRepository.findById(groupId);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await groupRepository.delete(groupId);
  return new NextResponse(null, { status: 204 });
}
