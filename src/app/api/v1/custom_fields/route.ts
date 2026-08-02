import { NextResponse } from "next/server";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return viaApiKey;
  return currentUserFromCookies();
}

// Mirrors Redmine's custom_fields.json: CustomFieldsController has `before_action :require_admin`
// unconditionally (unlike trackers/issue_statuses, which allow any authenticated request) and
// only `index` accepts API auth at all (`accept_api_auth :index`) — new/create/edit/update/destroy
// are HTML-only admin actions with no REST surface in Redmine itself, so this stays read-only.
export async function GET(request: Request) {
  const user = await resolveUser(request);
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const customFields = await new DrizzleCustomFieldRepository().listAll();
  return NextResponse.json({ customFields });
}
