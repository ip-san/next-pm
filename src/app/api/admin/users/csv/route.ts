import { NextResponse } from "next/server";
import { usersCsvBody } from "@/application/users/users-csv";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";

/**
 * Redmine's `users.csv` (UsersController#index in CSV form): every account except the anonymous
 * placeholder, with the default columns. Administrators only. A GET needs no CSRF check.
 */
export async function GET(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  const user = viaApiKey ?? (await currentUserFromCookies());
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const records = await new DrizzleUserRepository().listForCsvExport();
  return new NextResponse(usersCsvBody(records), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="users.csv"',
    },
  });
}
