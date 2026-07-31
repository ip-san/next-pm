import { notFound } from "next/navigation";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  return (
    <main className="p-8 flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{project.name}</h1>
      <p className="text-sm text-gray-600">{project.description}</p>
      <dl className="text-sm flex flex-col gap-1">
        <div>
          <dt className="inline font-medium">識別子: </dt>
          <dd className="inline">{project.identifier}</dd>
        </div>
        <div>
          <dt className="inline font-medium">公開: </dt>
          <dd className="inline">{project.isPublic ? "はい" : "いいえ"}</dd>
        </div>
        <div>
          <dt className="inline font-medium">有効なモジュール: </dt>
          <dd className="inline">{project.enabledModules.join(", ") || "(なし)"}</dd>
        </div>
        <div>
          <dt className="inline font-medium">nested set: </dt>
          <dd className="inline">
            lft={project.lft}, rgt={project.rgt}
          </dd>
        </div>
      </dl>
    </main>
  );
}
