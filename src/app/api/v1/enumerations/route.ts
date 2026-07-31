import { NextResponse } from "next/server";
import { enumerationTypeEnum } from "@/infrastructure/db/schema/enumerations";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return viaApiKey;
  return currentUserFromCookies();
}

// Mirrors Redmine's enumerations.json family (issue_priorities.json,
// time_entry_activities.json): global reference data, gated only on being logged in — no
// per-project or per-record permission concept applies to a system-wide priority list.
export async function GET(request: Request) {
  const user = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  if (!type || !enumerationTypeEnum.includes(type as (typeof enumerationTypeEnum)[number])) {
    return NextResponse.json({ error: `type must be one of: ${enumerationTypeEnum.join(", ")}` }, { status: 400 });
  }

  const enumerations = await new DrizzleEnumerationRepository().listByType(type as (typeof enumerationTypeEnum)[number]);
  return NextResponse.json({ enumerations });
}
