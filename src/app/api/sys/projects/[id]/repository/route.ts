import { NextResponse } from "next/server";
import { z } from "zod";
import { createSysProjectRepository, type CreateSysRepositoryInput } from "@/application/scm/sys-api";
import { InvalidRepositoryError } from "@/application/scm/connect-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleScmRepositoryRepository } from "@/infrastructure/db/repositories/scm-repository-repository";
import { SYS_API_DENIED, sysApiAuthorized } from "@/interface/http/sys-api-auth";

const createBodySchema = z.object({
  vendor: z.enum(["git", "subversion", "mercurial"]),
  repository: z.object({ identifier: z.string().default(""), url: z.string() }),
});

/**
 * Redmine's `POST /sys/projects/:id/repository`. Answers 201 with `{ "repository_<vendor>": {...} }`,
 * 409 when the project already has a default repository, and 404 for an unknown project.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await sysApiAuthorized(request))) return SYS_API_DENIED;
  const { id } = await params;
  const projectRepository = new DrizzleProjectRepository();
  const project = await projectRepository.findById(id).catch(() => null);
  if (!project) return new NextResponse(null, { status: 404 });

  const parsed = createBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 422 });

  const input: CreateSysRepositoryInput = {
    projectId: project.id,
    vendor: parsed.data.vendor,
    identifier: parsed.data.repository.identifier,
    url: parsed.data.repository.url,
  };
  try {
    const result = await createSysProjectRepository(
      { projectRepository, scmRepositoryRepository: new DrizzleScmRepositoryRepository() },
      input,
    );
    if (result.status === "conflict") return new NextResponse(null, { status: 409 });
    return NextResponse.json(
      { [`repository_${result.repository.vendor}`]: { id: result.repository.id, url: result.repository.rootPath } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof InvalidRepositoryError) return new NextResponse(null, { status: 422 });
    throw error;
  }
}
