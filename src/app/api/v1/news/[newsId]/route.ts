import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { InvalidNewsError } from "@/domain/news/validate";
import { deleteNews } from "@/application/news/delete-news";
import { updateNews } from "@/application/news/update-news";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

/** Mirrors the gate on projects/[identifier]/news/[newsId]/page.tsx: view_news, nothing else. */
export async function GET(request: Request, { params }: { params: Promise<{ newsId: string }> }) {
  const { newsId } = await params;
  const { user } = await resolveUser(request);

  const news = await new DrizzleNewsRepository().findById(newsId);
  if (!news) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const project = await new DrizzleProjectRepository().findById(news.projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_news", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({ news });
}

const updateNewsSchema = z.object({
  title: z.string().min(1),
  summary: z.string().default(""),
  description: z.string().min(1),
});

/** Redmine's `accept_api_auth :index, :show, :create, :update, :destroy` on NewsController. */
export async function PUT(request: Request, { params }: { params: Promise<{ newsId: string }> }) {
  const { newsId } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const newsRepository = new DrizzleNewsRepository();
  const news = await newsRepository.findById(newsId);
  if (!news) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const project = await new DrizzleProjectRepository().findById(news.projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_news", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = updateNewsSchema.safeParse((await request.json().catch(() => null))?.news);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  try {
    const updated = await updateNews(
      { newsRepository },
      { newsId: news.id, title: parsed.data.title, summary: parsed.data.summary, description: parsed.data.description },
    );
    return NextResponse.json({ news: updated });
  } catch (error) {
    if (error instanceof InvalidNewsError) {
      return NextResponse.json({ error: "invalid_news", message: error.message }, { status: 422 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ newsId: string }> }) {
  const { newsId } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const newsRepository = new DrizzleNewsRepository();
  const news = await newsRepository.findById(newsId);
  if (!news) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const project = await new DrizzleProjectRepository().findById(news.projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_news", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await deleteNews(
    { newsRepository, attachmentRepository: new DrizzleAttachmentRepository(), attachmentStorage: new FsAttachmentStore() },
    news.id,
  );
  return new NextResponse(null, { status: 204 });
}
