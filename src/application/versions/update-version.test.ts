import { describe, expect, it, mock } from "bun:test";
import { updateVersion } from "./update-version";
import { InvalidVersionError } from "./create-version";
import type { Version } from "@/domain/version/entity";
import type { VersionRepository } from "@/domain/version/repository";

function makeVersion(overrides: Partial<Version> = {}): Version {
  return {
    id: "version-1",
    projectId: "proj-1",
    name: "1.0.0",
    description: "",
    effectiveDate: null,
    status: "open",
    sharing: "none",
    wikiPageTitle: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepo(version: Version | null, siblings: Version[] = []): VersionRepository {
  return {
    listByProject: mock(async () => siblings),
    findById: mock(async () => version),
    create: mock(async () => {
      throw new Error("not implemented");
    }),
    update: mock(async (id, changes) => ({ ...(version as Version), ...changes, id }) as Version),
    delete: mock(async () => {}),
    countFixedIssues: mock(async () => 0),
  };
}

const baseInput = { versionId: "version-1", name: "1.0.1", description: "Updated", effectiveDate: "2026-08-01", status: "open" as const, wikiPageTitle: null };

describe("updateVersion", () => {
  it("updates a version's fields", async () => {
    const version = makeVersion();
    const versionRepository = makeRepo(version, [version]);
    const updated = await updateVersion({ versionRepository }, baseInput);
    expect(updated.name).toBe("1.0.1");
    expect(updated.status).toBe("open");
  });

  it("throws if the version does not exist", async () => {
    const versionRepository = makeRepo(null);
    await expect(updateVersion({ versionRepository }, baseInput)).rejects.toThrow(InvalidVersionError);
  });

  it("rejects a name colliding with a sibling version in the same project", async () => {
    const version = makeVersion();
    const sibling = makeVersion({ id: "version-2", name: "1.0.1" });
    const versionRepository = makeRepo(version, [version, sibling]);
    await expect(updateVersion({ versionRepository }, baseInput)).rejects.toThrow(InvalidVersionError);
  });

  it("rejects an invalid status", async () => {
    const version = makeVersion();
    const versionRepository = makeRepo(version, [version]);
    // @ts-expect-error intentionally invalid status for the runtime check
    await expect(updateVersion({ versionRepository }, { ...baseInput, status: "bogus" })).rejects.toThrow(InvalidVersionError);
  });
});
