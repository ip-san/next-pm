import { NextResponse } from "next/server";
import { isMemberRole } from "@/domain/role/entity";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return viaApiKey;
  return currentUserFromCookies();
}

// Mirrors Redmine's roles.json: RolesController#index is gated on require_admin_or_api_request
// (HTML needs admin, but any authenticated API caller is enough) and lists Role.givable,
// which is builtin: 0 only (role.rb) — Anonymous/Non member never appear here regardless of
// their `assignable` column, which is a separate flag used elsewhere (resolveActor) and not
// what Redmine's own givable scope checks.
export async function GET(request: Request) {
  const user = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const roles = await new DrizzleRoleRepository().listAll();
  const givable = roles.filter(isMemberRole).sort((a, b) => a.position - b.position);
  return NextResponse.json({ roles: givable.map((role) => ({ id: role.id, name: role.name })) });
}
