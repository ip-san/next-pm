import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { resolveWikiPage } from "@/application/wiki/resolve-wiki-page";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import {
  DrizzleWikiContentRepository,
  DrizzleWikiPageRepository,
  DrizzleWikiRedirectRepository,
} from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return viaApiKey;
  return currentUserFromCookies();
}

/** Mirrors the gate on projects/[identifier]/wiki/[title]/page.tsx: view_wiki_pages, nothing else. */
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string; title: string }> }) {
  const { identifier, title: rawTitle } = await params;
  const title = decodeURIComponent(rawTitle);

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await resolveUser(request);
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_wiki_pages", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const resolved = await resolveWikiPage(
    { wikiPageRepository: new DrizzleWikiPageRepository(), wikiRedirectRepository: new DrizzleWikiRedirectRepository() },
    project.id,
    title,
  );
  if (!resolved) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (resolved.redirected) {
    return NextResponse.redirect(new URL(`/api/v1/projects/${identifier}/wiki/${encodeURIComponent(resolved.page.title)}`, request.url));
  }
  const wikiPage = resolved.page;
  const current = await new DrizzleWikiContentRepository().findCurrent(wikiPage.id);
  if (!current) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ wiki_page: wikiPage, current_version: current });
}
