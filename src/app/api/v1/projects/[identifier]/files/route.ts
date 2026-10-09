import { NextResponse } from "next/server";
import { z } from "zod";
import type { Attachment } from "@/domain/attachment/entity";
import { parseFileSort, sortAttachments } from "@/domain/attachment/file-sort";
import { can } from "@/domain/authorization/authorization-service";
import { filterMembersWithPermission, memberUserIds } from "@/domain/member/entity";
import { compareVersions } from "@/domain/version/sort";
import { InvalidUploadTokenError, redeemUploadToken } from "@/application/attachments/upload-token";
import { enqueueNotification } from "@/application/jobs/enqueue-notification";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { verifyCsrf } from "@/interface/http/csrf";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { localizedMail } from "@/domain/i18n/mail-text";
import { interpolate, translate } from "@/domain/i18n/messages";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

function serialize(attachment: Attachment, version: { id: string; name: string } | null) {
  return {
    id: attachment.id,
    filename: attachment.filename,
    filesize: attachment.fileSize,
    content_type: attachment.contentType,
    description: attachment.description,
    content_url: `/api/attachments/${attachment.id}`,
    digest: attachment.digest,
    downloads: attachment.downloads,
    author_id: attachment.authorId,
    created_on: attachment.createdAt.toISOString(),
    version: version ? { id: version.id, name: version.name } : null,
  };
}

/** Mirrors GET /projects/:id/files.(json|xml) — FilesController#index's api format. */
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const { user } = await resolveUser(request);

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_files", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const sort = parseFileSort(url.searchParams.get("sort") ?? undefined, url.searchParams.get("order") ?? undefined);

  const attachmentRepository = new DrizzleAttachmentRepository();
  const versions = (await new DrizzleVersionRepository().listByProject(project.id)).sort(compareVersions).reverse();
  const [projectFiles, versionFiles] = await Promise.all([
    attachmentRepository.listByContainer("Project", project.id),
    attachmentRepository.listByContainers(
      "Version",
      versions.map((version) => version.id),
    ),
  ]);

  const files = [
    ...sortAttachments(projectFiles, sort).map((file) => serialize(file, null)),
    ...versions.flatMap((version) =>
      sortAttachments(
        versionFiles.filter((file) => file.containerId === version.id),
        sort,
      ).map((file) => serialize(file, version)),
    ),
  ];

  return NextResponse.json({ files });
}

const createFileSchema = z.object({
  token: z.string().min(1),
  version_id: z.string().uuid().nullish(),
  filename: z.string().nullish(),
  description: z.string().nullish(),
});

/**
 * Mirrors POST /projects/:id/files.json: the body carries an upload token obtained from
 * POST /api/v1/uploads, optionally with a version to release the file under.
 */
export async function POST(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_files", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = createFileSchema.safeParse((await request.json().catch(() => null))?.file);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  let version = null;
  if (parsed.data.version_id) {
    version = await new DrizzleVersionRepository().findById(parsed.data.version_id);
    // Own versions only, like FilesController#create's `@project.versions.find_by_id`.
    if (!version || version.projectId !== project.id) {
      return NextResponse.json({ error: "invalid_request", message: "unknown version" }, { status: 422 });
    }
  }

  try {
    const attachment = await redeemUploadToken(
      { attachmentRepository: new DrizzleAttachmentRepository() },
      {
        token: parsed.data.token,
        uploaderId: user.id,
        containerType: version ? "Version" : "Project",
        containerId: version ? version.id : project.id,
        filename: parsed.data.filename ?? undefined,
        description: parsed.data.description ?? undefined,
      },
    );
    // Same `file_added` notification the UI action sends (Mailer#attachments_added).
    const members = await new DrizzleMemberRepository().listByProject(project.id);
    const rolesById = new Map(
      (await new DrizzleRoleRepository().findByIds([...new Set(members.flatMap((m) => m.roleIds))])).map((role) => [role.id, role]),
    );
    await enqueueNotification(
      { jobRepository: new DrizzleJobRepository() },
      {
        recipientGroups: [memberUserIds(filterMembersWithPermission(members, rolesById, "view_files"))],
        excludeUserId: user.id,
        ...localizedMail((locale) => ({
          subject: interpolate(translate(locale, "mail.fileAdded.subject"), { project: project.name, filename: attachment.filename }),
          body: `${interpolate(translate(locale, "mail.fileAdded.body"), { project: project.name, filename: attachment.filename })}\n/projects/${project.identifier}/files`,
        })),
      },
    );

    return NextResponse.json({ file: serialize(attachment, version) }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidUploadTokenError) {
      return NextResponse.json({ error: "invalid_token", message: error.message }, { status: 422 });
    }
    throw error;
  }
}
