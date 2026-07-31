import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

const CSRF_COOKIE_NAME = "next_pm_csrf";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  if (!request.cookies.get(CSRF_COOKIE_NAME)) {
    response.cookies.set(CSRF_COOKIE_NAME, randomBytes(32).toString("hex"), {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  }

  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
