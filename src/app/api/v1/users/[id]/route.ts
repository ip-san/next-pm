import { NextResponse } from "next/server";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return viaApiKey;
  return currentUserFromCookies();
}

// A user may always fetch their own record (mirrors "current" special-casing many REST
// APIs offer); anyone else's record requires admin, same gate as the collection endpoint.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requester = await resolveUser(request);
  if (!requester) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!requester.isAdmin && requester.id !== id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const target = await new DrizzleUserRepository().findById(id);
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: target.id,
      login: target.login,
      mail: target.mail,
      firstname: target.firstname,
      lastname: target.lastname,
      admin: target.isAdmin,
      status: target.status,
    },
  });
}
