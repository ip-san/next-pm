import { describe, expect, it } from "bun:test";
import { buildInstallationChecklist, formatEnvironment } from "./installation-info";

describe("buildInstallationChecklist", () => {
  it("passes every check on a healthy installation", () => {
    const items = buildInstallationChecklist({ defaultAdminPasswordInUse: false, storageWritable: true, pendingMigrations: 0 });
    expect(items.every((item) => item.ok)).toBe(true);
  });

  it("flags the default admin password, an unwritable store and pending migrations", () => {
    const items = buildInstallationChecklist({ defaultAdminPasswordInUse: true, storageWritable: false, pendingMigrations: 2 });
    expect(items.map((item) => item.ok)).toEqual([false, false, false]);
  });
});

describe("formatEnvironment", () => {
  it("lists each fact on its own line and says when an SCM tool is missing", () => {
    const text = formatEnvironment({
      appVersion: "0.1.0",
      nextVersion: "16.2.12",
      runtime: "Bun 1.4.2",
      databaseVersion: "16.4",
      scmVersions: [
        { name: "Git", version: "git version 2.45.0" },
        { name: "Mercurial", version: null },
      ],
    });
    expect(text).toContain("next-pm version: 0.1.0");
    expect(text).toContain("Database: PostgreSQL 16.4");
    expect(text).toContain("Git: git version 2.45.0");
    expect(text).toContain("Mercurial: not installed");
  });
});
