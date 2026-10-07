import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Attachment } from "@/domain/attachment/entity";
import { FILE_SORT_COLUMNS, nextSortFor, parseFileSort, sortAttachments, type FileSortColumn } from "@/domain/attachment/file-sort";
import { can } from "@/domain/authorization/authorization-service";
import { compareVersions } from "@/domain/version/sort";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { DeleteFileButton } from "./delete-file-button";
import { FileDescriptionForm } from "./file-description-form";
import { FileUploadForm } from "./file-upload-form";

export const dynamic = "force-dynamic";

const COLUMN_LABEL: Record<FileSortColumn, string> = {
  filename: "ファイル",
  created_on: "日付",
  size: "サイズ",
  downloads: "DL数",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function ProjectFilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ sort?: string; order?: string }>;
}) {
  const { identifier } = await params;
  const { sort: sortParam, order: orderParam } = await searchParams;
  const sort = parseFileSort(sortParam, orderParam);

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "view_files", project: projectContext, actor })) {
    notFound();
  }
  const canManageFiles = can({ permission: "manage_files", project: projectContext, actor });

  const attachmentRepository = new DrizzleAttachmentRepository();
  // Own versions only — a version shared in from another project lists its files on that
  // project's page, mirroring FilesController#index's `@project.versions`.
  const versions = (await new DrizzleVersionRepository().listByProject(project.id)).sort(compareVersions).reverse();
  const [projectFiles, versionFiles] = await Promise.all([
    attachmentRepository.listByContainer("Project", project.id),
    attachmentRepository.listByContainers(
      "Version",
      versions.map((version) => version.id),
    ),
  ]);

  const containers: { key: string; label: string; href: string | null; files: Attachment[] }[] = [
    { key: "project", label: project.name, href: null, files: projectFiles },
    ...versions.map((version) => ({
      key: version.id,
      label: version.name,
      href: `/projects/${identifier}/versions/${version.id}`,
      files: versionFiles.filter((file) => file.containerId === version.id),
    })),
  ].filter((container) => container.files.length > 0);

  function sortHref(column: FileSortColumn): string {
    const next = nextSortFor(sort, column);
    return `?sort=${next.column}&order=${next.order}`;
  }

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">ファイル</h1>

      {containers.length === 0 ? (
        <p className="text-gray-400 text-xs">ファイルはありません。</p>
      ) : (
        <table className="text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              {FILE_SORT_COLUMNS.map((column) => (
                <th key={column} className="py-1 pr-4 font-medium">
                  <Link href={sortHref(column)} className={column === sort.column ? "underline font-semibold" : "underline text-gray-500"}>
                    {COLUMN_LABEL[column]}
                    {column === sort.column ? (sort.order === "asc" ? " ↑" : " ↓") : ""}
                  </Link>
                </th>
              ))}
              <th className="py-1 pr-4 font-medium">ダイジェスト</th>
              <th className="py-1 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {containers.map((container) => (
              <Fragment key={container.key}>
                <tr className="border-b bg-gray-50">
                  <th colSpan={6} className="py-1 text-left font-semibold">
                    {container.href ? (
                      <Link href={container.href} className="underline">
                        {container.label}
                      </Link>
                    ) : (
                      container.label
                    )}
                  </th>
                </tr>
                {sortAttachments(container.files, sort).map((file) => (
                  <tr key={file.id} className="border-b align-top">
                    <td className="py-1 pr-4">
                      <a href={`/api/attachments/${file.id}`} className="underline">
                        {file.filename}
                      </a>
                      {file.description ? <span className="text-gray-500 text-xs block">{file.description}</span> : null}
                      {canManageFiles ? (
                        <FileDescriptionForm attachmentId={file.id} projectIdentifier={identifier} description={file.description} />
                      ) : null}
                    </td>
                    <td className="py-1 pr-4 text-gray-600">{file.createdAt.toISOString().slice(0, 10)}</td>
                    <td className="py-1 pr-4 text-gray-600">{formatSize(file.fileSize)}</td>
                    <td className="py-1 pr-4 text-gray-600">{file.downloads}</td>
                    <td className="py-1 pr-4 text-gray-500 text-xs break-all">SHA256: {file.digest}</td>
                    <td className="py-1">
                      {canManageFiles ? <DeleteFileButton attachmentId={file.id} projectIdentifier={identifier} /> : null}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      {canManageFiles ? <FileUploadForm projectIdentifier={identifier} versions={versions.map((v) => ({ id: v.id, name: v.name }))} /> : null}
    </main>
  );
}
