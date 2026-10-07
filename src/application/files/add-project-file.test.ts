import { describe, expect, it, mock } from "bun:test";
import { addProjectFile, InvalidProjectFileError } from "./add-project-file";
import { InvalidAttachmentError } from "@/domain/attachment/validate";
import type { Attachment } from "@/domain/attachment/entity";
import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";
import type { SettingsRepository } from "@/domain/settings/repository";
import type { Version } from "@/domain/version/entity";
import type { VersionRepository } from "@/domain/version/repository";

function makeVersion(projectId: string): Version {
  return {
    id: "version-1",
    projectId,
    name: "1.0",
    description: "",
    effectiveDate: null,
    status: "open",
    sharing: "none",
    wikiPageTitle: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeRepos(version: Version | null) {
  const attachmentStorage: AttachmentStorage = {
    save: mock(async () => "generated-key"),
    read: mock(async () => Buffer.from("")),
    delete: mock(async () => {}),
  };
  const attachmentRepository: AttachmentRepository = {
    listByContainer: mock(async () => []),
    listByContainers: mock(async () => []),
    findById: mock(async () => null),
    create: mock(async (a) => ({ ...a, id: "att-1", downloads: 0, createdAt: new Date() }) as Attachment),
    update: mock(async () => {
      throw new Error("not implemented");
    }),
    incrementDownloads: mock(async () => {}),
    attachToContainer: mock(async () => {}),
    delete: mock(async () => {}),
    listPendingOlderThan: mock(async () => []),
  };
  const settingsRepository: SettingsRepository = {
    getAll: mock(async () => ({})),
    setMany: mock(async () => {}),
  };
  const versionRepository = {
    findById: mock(async () => version),
  } as unknown as VersionRepository;
  return { attachmentRepository, attachmentStorage, settingsRepository, versionRepository };
}

const baseInput = {
  projectId: "project-1",
  versionId: null,
  authorId: "user-1",
  filename: "release-notes.txt",
  contentType: "text/plain",
  description: "リリースノート",
  data: Buffer.from("contents"),
};

describe("addProjectFile", () => {
  it("attaches the file to the project when no version is given", async () => {
    const repos = makeRepos(null);
    const attachment = await addProjectFile(repos, baseInput);
    expect(attachment.containerType).toBe("Project");
    expect(attachment.containerId).toBe("project-1");
    expect(attachment.description).toBe("リリースノート");
  });

  it("attaches the file to a version of the same project", async () => {
    const repos = makeRepos(makeVersion("project-1"));
    const attachment = await addProjectFile(repos, { ...baseInput, versionId: "version-1" });
    expect(attachment.containerType).toBe("Version");
    expect(attachment.containerId).toBe("version-1");
  });

  it("rejects a version owned by another project before touching storage", async () => {
    const repos = makeRepos(makeVersion("other-project"));
    await expect(addProjectFile(repos, { ...baseInput, versionId: "version-1" })).rejects.toThrow(InvalidProjectFileError);
    expect(repos.attachmentStorage.save).not.toHaveBeenCalled();
  });

  it("still enforces the attachment size/filename rules", async () => {
    const repos = makeRepos(null);
    await expect(addProjectFile(repos, { ...baseInput, data: Buffer.alloc(0) })).rejects.toThrow(InvalidAttachmentError);
  });
});
