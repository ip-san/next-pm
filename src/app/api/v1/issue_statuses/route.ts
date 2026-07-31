import { NextResponse } from "next/server";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return viaApiKey;
  return currentUserFromCookies();
}

// Mirrors Redmine's issue_statuses.json: IssueStatusesController#index is gated on
// require_admin_or_api_request — global reference data, no per-project permission concept.
export async function GET(request: Request) {
  const user = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const issueStatuses = await new DrizzleIssueStatusRepository().listAll();
  return NextResponse.json({ issueStatuses });
}
