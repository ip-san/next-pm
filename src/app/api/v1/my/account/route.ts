import { NextResponse } from "next/server";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";

export async function GET(request: Request) {
  const user =
    (await currentUserFromAuthorizationHeader(request)) ?? (await currentUserFromCookies());

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      login: user.login,
      mail: user.mail,
      firstname: user.firstname,
      lastname: user.lastname,
      isAdmin: user.isAdmin,
    },
  });
}
