import { describe, expect, it } from "bun:test";
import { usersCsvBody, USERS_CSV_HEADER } from "./users-csv";

describe("usersCsvBody", () => {
  it("writes the header and one row per user, with the status and the yes/no flag in words", () => {
    const body = usersCsvBody([
      { login: "alice", firstname: "Alice", lastname: "Dev", mail: "a@example.com", isAdmin: true, status: "active", createdAt: new Date("2026-10-01T09:30:05Z") },
      { login: "bob", firstname: "Bob", lastname: "Ops", mail: "b@example.com", isAdmin: false, status: "locked", createdAt: new Date("2026-10-02T00:00:00Z") },
    ]);
    const lines = body.trimEnd().split("\r\n");
    expect(lines[0]).toBe("ログインID,名,姓,メール,管理者,状態,作成日時");
    expect(USERS_CSV_HEADER.join(",")).toBe(lines[0]);
    expect(lines[1]).toBe("alice,Alice,Dev,a@example.com,はい,有効,2026-10-01 09:30:05");
    expect(lines[2]).toBe("bob,Bob,Ops,b@example.com,いいえ,ロック中,2026-10-02 00:00:00");
  });

  it("quotes a field that contains a comma, so a name can't add a column", () => {
    const body = usersCsvBody([
      { login: "carol", firstname: "Carol, Jr", lastname: "X", mail: "c@example.com", isAdmin: false, status: "registered", createdAt: new Date("2026-10-03T00:00:00Z") },
    ]);
    expect(body.split("\r\n")[1]).toContain('"Carol, Jr"');
  });

  it("writes the header, statuses and yes/no in the viewer's language", () => {
    const body = usersCsvBody(
      [{ login: "alice", firstname: "Alice", lastname: "Dev", mail: "a@example.com", isAdmin: true, status: "registered", createdAt: new Date("2026-10-01T09:30:05Z") }],
      "en",
    );
    const lines = body.trimEnd().split("\r\n");
    expect(lines[0]).toBe("Login,First name,Last name,Email,Administrator,Status,Created");
    expect(lines[1]).toBe("alice,Alice,Dev,a@example.com,Yes,Registered,2026-10-01 09:30:05");
  });
});
