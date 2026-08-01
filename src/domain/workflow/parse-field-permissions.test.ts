import { describe, expect, it } from "bun:test";
import { parseFieldPermissionEntries } from "./parse-field-permissions";

const validStatusIds = new Set(["status-1", "status-2"]);

describe("parseFieldPermissionEntries", () => {
  it("parses a well-formed cell", () => {
    const result = parseFieldPermissionEntries([["perm:status-1:dueDate", "required"]], validStatusIds);
    expect(result).toEqual({
      ok: true,
      permissions: [{ statusId: "status-1", fieldName: "dueDate", rule: "required" }],
    });
  });

  it("ignores entries without the perm: prefix (trackerId, roleId, etc.)", () => {
    const result = parseFieldPermissionEntries(
      [
        ["trackerId", "tracker-1"],
        ["roleId", "role-1"],
      ],
      validStatusIds,
    );
    expect(result).toEqual({ ok: true, permissions: [] });
  });

  it("ignores an empty value (the 'editable' default option)", () => {
    const result = parseFieldPermissionEntries([["perm:status-1:dueDate", ""]], validStatusIds);
    expect(result).toEqual({ ok: true, permissions: [] });
  });

  it("splits on colons unambiguously since statusId is a uuid-shaped string with no colons", () => {
    const result = parseFieldPermissionEntries([["perm:status-1:categoryId", "readonly"]], validStatusIds);
    expect(result).toEqual({
      ok: true,
      permissions: [{ statusId: "status-1", fieldName: "categoryId", rule: "readonly" }],
    });
  });

  it("rejects an unknown status id", () => {
    const result = parseFieldPermissionEntries([["perm:unknown-status:dueDate", "required"]], validStatusIds);
    expect(result).toEqual({ ok: false, error: "不正な入力が指定されました。" });
  });

  it("rejects a field name outside the eligible set", () => {
    const result = parseFieldPermissionEntries([["perm:status-1:statusId", "required"]], validStatusIds);
    expect(result).toEqual({ ok: false, error: "不正な入力が指定されました。" });
  });

  it("rejects a rule value that isn't readonly or required", () => {
    const result = parseFieldPermissionEntries([["perm:status-1:dueDate", "no_change"]], validStatusIds);
    expect(result).toEqual({ ok: false, error: "不正な入力が指定されました。" });
  });

  it("parses every cell across multiple statuses and fields", () => {
    const result = parseFieldPermissionEntries(
      [
        ["perm:status-1:dueDate", "required"],
        ["perm:status-2:description", "readonly"],
      ],
      validStatusIds,
    );
    expect(result).toEqual({
      ok: true,
      permissions: [
        { statusId: "status-1", fieldName: "dueDate", rule: "required" },
        { statusId: "status-2", fieldName: "description", rule: "readonly" },
      ],
    });
  });
});
