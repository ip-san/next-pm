import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { InvalidRefError } from "@/domain/scm/validate-path";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleScmRepositoryRepository } from "@/infrastructure/db/repositories/scm-repository-repository";
import { GitCliBrowser } from "@/infrastructure/scm/git-cli-browser";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export const dynamic = "force-dynamic";

function diffLineClassName(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return "text-gray-500";
  if (line.startsWith("+")) return "bg-green-50 text-green-800";
  if (line.startsWith("-")) return "bg-red-50 text-red-800";
  if (line.startsWith("@@")) return "text-blue-700 font-medium";
  return "";
}

export default async function RevisionDiffPage({ params }: { params: Promise<{ identifier: string; hash: string }> }) {
  const { identifier, hash } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "view_changesets", project: projectContext, actor })) {
    notFound();
  }

  const scmRepository = await new DrizzleScmRepositoryRepository().findByProject(project.id);
  if (!scmRepository) {
    notFound();
  }

  let diff: string | null = null;
  let error: string | null = null;
  try {
    diff = await new GitCliBrowser().diff(scmRepository.rootPath, hash);
  } catch (diffError) {
    error = diffError instanceof InvalidRefError ? diffError.message : "リビジョンが見つかりません。";
  }

  return (
    <main className="p-8 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold font-mono">リビジョン {hash.slice(0, 8)}</h1>
        <Link href={`/projects/${identifier}/repository`} className="underline text-sm">
          リポジトリ
        </Link>
      </div>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <pre className="text-xs font-mono border rounded p-3 overflow-x-auto whitespace-pre">
          {diff?.split("\n").map((line, i) => (
            <div key={i} className={diffLineClassName(line)}>
              {line}
            </div>
          ))}
        </pre>
      )}
    </main>
  );
}
