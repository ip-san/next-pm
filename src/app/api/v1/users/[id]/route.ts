import { NextResponse } from "next/server";
import { z } from "zod";
import { changeUserStatus, UserStatusChangeError } from "@/application/users/change-user-status";
import { deleteUser, UserNotDeletableError } from "@/application/users/delete-user";
import { updateUser, UserUpdateError } from "@/application/users/update-user";
import type { User } from "@/domain/user/entity";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { verifyCsrf } from "@/interface/http/csrf";

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

/** Writes need an administrator. A cookie session also has to pass the CSRF check, as the collection's POST does. */
async function resolveAdminForWrite(request: Request): Promise<{ admin: User } | { response: NextResponse }> {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  const viaCookie = viaApiKey ? null : await currentUserFromCookies();
  const user = viaApiKey ?? viaCookie;
  if (!user?.isAdmin) {
    return { response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return { response: NextResponse.json({ error: "csrf_check_failed" }, { status: 403 }) };
  }
  return { admin: user };
}

const updateBodySchema = z.object({
  login: z.string().min(1).max(30).optional(),
  mail: z.string().email().optional(),
  firstname: z.string().min(1).optional(),
  lastname: z.string().min(1).optional(),
  admin: z.boolean().optional(),
  password: z.string().optional(),
});

/**
 * Redmine's `PUT /users/:id`. A partial update: fields left out keep their values. Answers 204.
 * The directory (auth source) is not changed here, and the password is set only when given.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveAdminForWrite(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const body = updateBodySchema.safeParse((await request.json().catch(() => null))?.user);
  if (!body.success) {
    return NextResponse.json({ error: "invalid_request", details: body.error.issues }, { status: 422 });
  }

  const userRepository = new DrizzleUserRepository();
  const target = await userRepository.findById(id);
  if (!target || target.status === "anonymous") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    await updateUser(
      { userRepository, userAdminRepository: userRepository },
      {
        userId: id,
        login: body.data.login ?? target.login,
        mail: body.data.mail ?? target.mail,
        firstname: body.data.firstname ?? target.firstname,
        lastname: body.data.lastname ?? target.lastname,
        isAdmin: body.data.admin ?? target.isAdmin,
        authSource: target.authSource,
        password: body.data.password ?? "",
      },
      auth.admin.id,
    );
  } catch (error) {
    if (error instanceof UserUpdateError) {
      return NextResponse.json({ error: "invalid_request", message: error.message }, { status: 422 });
    }
    throw error;
  }
  return new NextResponse(null, { status: 204 });
}

/**
 * Redmine's `DELETE /users/:id`: removes the account, or locks it when `lock` is given. Answers 204.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveAdminForWrite(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const userRepository = new DrizzleUserRepository();
  const target = await userRepository.findById(id);
  if (!target || target.status === "anonymous") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const repositories = { userRepository, userAdminRepository: userRepository };
  try {
    if (new URL(request.url).searchParams.has("lock")) {
      await changeUserStatus(repositories, id, "locked", auth.admin.id);
    } else {
      await deleteUser(repositories, id, auth.admin.id);
    }
  } catch (error) {
    if (error instanceof UserNotDeletableError || error instanceof UserStatusChangeError) {
      return NextResponse.json({ error: "unprocessable", message: error.message }, { status: 422 });
    }
    throw error;
  }
  return new NextResponse(null, { status: 204 });
}
