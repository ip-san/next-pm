import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

const CSRF_COOKIE_NAME = "next_pm_csrf";
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "next_pm_session";
const AUTOLOGIN_COOKIE_NAME = "next_pm_autologin";
const AUTOLOGIN_PATH = "/api/account/autologin";

/**
 * Redmine redeems a remember-me cookie in ApplicationController#user_setup, i.e. on any
 * request. next-pm's equivalent is split in two because only a Route Handler may set a
 * cookie: this spots the condition and hands the request to that handler, which does the
 * work and bounces back to where the user was going. The DB is never touched here — the test
 * is purely "has a remember-me cookie, has no session cookie".
 */
function shouldAttemptAutologin(request: NextRequest): boolean {
  if (request.method !== "GET") return false;
  if (request.cookies.get(SESSION_COOKIE_NAME)) return false;
  if (!request.cookies.get(AUTOLOGIN_COOKIE_NAME)) return false;
  // The handler itself must not be redirected into itself, and a failed redemption clears the
  // cookie there, so there is no loop even if it refuses.
  return request.nextUrl.pathname !== AUTOLOGIN_PATH;
}

export function proxy(request: NextRequest) {
  if (shouldAttemptAutologin(request)) {
    const target = new URL(AUTOLOGIN_PATH, request.nextUrl.origin);
    target.searchParams.set("back", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(target);
  }

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
