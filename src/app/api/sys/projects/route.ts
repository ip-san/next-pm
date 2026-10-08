import { NextResponse } from "next/server";
import { listSysProjects } from "@/application/scm/sys-api";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleScmRepositoryRepository } from "@/infrastructure/db/repositories/scm-repository-repository";
import { SYS_API_DENIED, sysApiAuthorized } from "@/interface/http/sys-api-auth";

/** Redmine's `GET /sys/projects`: the repository-enabled active projects and their default repositories. */
export async function GET(request: Request) {
  if (!(await sysApiAuthorized(request))) return SYS_API_DENIED;
  const projects = await listSysProjects({
    projectRepository: new DrizzleProjectRepository(),
    scmRepositoryRepository: new DrizzleScmRepositoryRepository(),
  });
  return NextResponse.json(projects);
}
