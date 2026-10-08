import type { Attachment } from "@/domain/attachment/entity";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import type { Project } from "@/domain/project/entity";
import type { User } from "@/domain/user/entity";
import { DrizzleBoardRepository } from "@/infrastructure/db/repositories/board-repository";
import { DrizzleDocumentRepository } from "@/infrastructure/db/repositories/document-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { DrizzleWikiPageRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "./resolve-actor";

export type AttachmentAction = "view" | "edit" | "delete";

export interface AttachmentAccess {
  project: Project;
  allows: (action: AttachmentAction) => boolean;
}

/**
 * Single source of truth for "who may read/rename/remove this attachment", shared by the
 * download endpoint, the thumbnail endpoint and the REST attachment endpoints — a second
 * hand-maintained copy of this ladder is how an IDOR creeps in.
 *
 * Permissions per container mirror Redmine's `acts_as_attachable` declarations:
 *   Issue      view_issues / edit_issues (or edit_own_issues as the author)
 *   Message    view_messages / edit_messages        (message.rb: bare acts_as_attachable, so
 *                                                    both edit and delete fall back to edit_*)
 *   News       view_news / manage_news / manage_news (news.rb)
 *   Document   view_documents / edit_documents / delete_documents
 *   WikiPage   view_wiki_pages / edit_wiki_pages
 *   Project    view_files / manage_files   (project.rb)
 *   Version    view_files / manage_files   (version.rb)
 * Returns null when the attachment is invisible to `user` (treat as 404, never 403, so the
 * endpoint does not leak that the row exists).
 */
export async function resolveAttachmentAccess(attachment: Attachment, user: User | null): Promise<AttachmentAccess | null> {
  if (!attachment.containerType || !attachment.containerId) {
    // Pending upload — only reachable through its token, never by id.
    return null;
  }

  const projectRepository = new DrizzleProjectRepository();

  switch (attachment.containerType) {
    case "Issue": {
      const issue = await new DrizzleIssueRepository().findById(attachment.containerId);
      if (!issue) return null;
      const project = await projectRepository.findById(issue.projectId);
      if (!project) return null;

      const { actor, userGroupIds } = await resolveActor(user, project.id);
      const projectContext = toAuthorizationProject(project);
      if (!can({ permission: "view_issues", project: projectContext, actor })) return null;
      if (!isPrivateIssueVisible(issue, user?.id ?? null, userGroupIds, issuesVisibilityRoles(actor))) return null;

      const editable =
        can({ permission: "edit_issues", project: projectContext, actor }) ||
        (can({ permission: "edit_own_issues", project: projectContext, actor }) && issue.authorId === user?.id);
      return { project, allows: (action) => action === "view" || editable };
    }
    case "Message": {
      const message = await new DrizzleMessageRepository().findById(attachment.containerId);
      if (!message) return null;
      const board = await new DrizzleBoardRepository().findById(message.boardId);
      if (!board) return null;
      const project = await projectRepository.findById(board.projectId);
      if (!project) return null;

      const { actor } = await resolveActor(user, project.id);
      const projectContext = toAuthorizationProject(project);
      if (!can({ permission: "view_messages", project: projectContext, actor })) return null;
      // Message declares `acts_as_attachable` with no options, so edit_permission and
      // delete_permission both default to edit_messages — edit_own_messages is not enough.
      return {
        project,
        allows: (action) => action === "view" || can({ permission: "edit_messages", project: projectContext, actor }),
      };
    }
    case "News": {
      const item = await new DrizzleNewsRepository().findById(attachment.containerId);
      if (!item) return null;
      const project = await projectRepository.findById(item.projectId);
      if (!project) return null;

      const { actor } = await resolveActor(user, project.id);
      const projectContext = toAuthorizationProject(project);
      if (!can({ permission: "view_news", project: projectContext, actor })) return null;
      // news.rb: `acts_as_attachable :edit_permission => :manage_news, :delete_permission => :manage_news`.
      return {
        project,
        allows: (action) => action === "view" || can({ permission: "manage_news", project: projectContext, actor }),
      };
    }
    case "Document": {
      const document = await new DrizzleDocumentRepository().findById(attachment.containerId);
      if (!document) return null;
      const project = await projectRepository.findById(document.projectId);
      if (!project) return null;

      const { actor } = await resolveActor(user, project.id);
      const projectContext = toAuthorizationProject(project);
      if (!can({ permission: "view_documents", project: projectContext, actor })) return null;
      return {
        project,
        allows: (action) =>
          action === "view" ||
          can({ permission: action === "delete" ? "delete_documents" : "edit_documents", project: projectContext, actor }),
      };
    }
    case "WikiPage": {
      const wikiPage = await new DrizzleWikiPageRepository().findById(attachment.containerId);
      if (!wikiPage) return null;
      const project = await projectRepository.findById(wikiPage.projectId);
      if (!project) return null;

      const { actor } = await resolveActor(user, project.id);
      const projectContext = toAuthorizationProject(project);
      if (!can({ permission: "view_wiki_pages", project: projectContext, actor })) return null;
      // Redmine splits this into delete_wiki_pages_attachments; next-pm's wiki actions gate
      // attachment upload/delete on edit_wiki_pages alike, so stay consistent with them.
      return {
        project,
        allows: (action) => action === "view" || can({ permission: "edit_wiki_pages", project: projectContext, actor }),
      };
    }
    case "Project":
    case "Version": {
      const project =
        attachment.containerType === "Project"
          ? await projectRepository.findById(attachment.containerId)
          : await (async () => {
              const version = await new DrizzleVersionRepository().findById(attachment.containerId!);
              return version ? projectRepository.findById(version.projectId) : null;
            })();
      if (!project) return null;

      const { actor } = await resolveActor(user, project.id);
      const projectContext = toAuthorizationProject(project);
      if (!can({ permission: "view_files", project: projectContext, actor })) return null;
      return {
        project,
        allows: (action) => action === "view" || can({ permission: "manage_files", project: projectContext, actor }),
      };
    }
    default:
      return null;
  }
}
