import { describe, expect, it, mock } from "bun:test";
import { createVersion, InvalidVersionError } from "./create-version";
import type { Version } from "@/domain/version/entity";
import type { VersionRepository } from "@/domain/version/repository";

function makeRepo(existing: Version[] = []): VersionRepository {
  return {
    listByProject: mock(async () => existing),
    findById: mock(async () => null),
    create: mock(async (version) => ({ ...version, id: "version-1", createdAt: new Date(), updatedAt: new Date() }) as Version),
    update: mock(async () => {
      throw new Error("not implemented");
    }),
    delete: mock(async () => {}),
    countFixedIssues: mock(async () => 0),
  };
}

const baseInput = { projectId: "proj-1", name: "1.0.0", description: "First release", effectiveDate: null, wikiPageTitle: null };

describe("createVersion", () => {
  it("creates a version with valid fields", async () => {
    const versionRepository = makeRepo();
    const version = await createVersion({ versionRepository }, baseInput);
    expect(version.name).toBe("1.0.0");
    expect(version.status).toBe("open");
    expect(version.sharing).toBe("none");
  });

  it("rejects an empty name", async () => {
    const versionRepository = makeRepo();
    await expect(createVersion({ versionRepository }, { ...baseInput, name: "" })).rejects.toThrow(InvalidVersionError);
  });

  it("rejects a name longer than 60 characters", async () => {
    const versionRepository = makeRepo();
    await expect(createVersion({ versionRepository }, { ...baseInput, name: "a".repeat(61) })).rejects.toThrow(InvalidVersionError);
  });

  it("rejects a description longer than 255 characters", async () => {
    const versionRepository = makeRepo();
    await expect(createVersion({ versionRepository }, { ...baseInput, description: "a".repeat(256) })).rejects.toThrow(InvalidVersionError);
  });

  it("rejects a duplicate name within the same project", async () => {
    const existing: Version = {
      id: "existing",
      projectId: "proj-1",
      name: "1.0.0",
      description: "",
      effectiveDate: null,
      status: "open",
      sharing: "none",
      wikiPageTitle: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const versionRepository = makeRepo([existing]);
    await expect(createVersion({ versionRepository }, baseInput)).rejects.toThrow(InvalidVersionError);
  });
});
