import { NextResponse } from "next/server";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return viaApiKey;
  return currentUserFromCookies();
}

// Mirrors Redmine's trackers.json: TrackersController#index is gated on
// require_admin_or_api_request — global reference data, no per-project permission concept.
export async function GET(request: Request) {
  const user = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const trackers = await new DrizzleTrackerRepository().listAll();
  return NextResponse.json({ trackers });
}
