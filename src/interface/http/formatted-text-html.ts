import { renderFormattedText } from "@/domain/formatting/markdown";
import { issueReferenceNumbers } from "@/domain/formatting/issue-references";
import { revisionReferenceIds, wikiReferenceTargets } from "@/domain/formatting/repository-references";
import type { User } from "@/domain/user/entity";
import { resolveIssueLinks } from "@/interface/http/issue-links";
import { resolveRevisionLinks, resolveWikiLinks, type TextProject } from "@/interface/http/project-text-links";

/**
 * The HTML for a text in a project, as this viewer should see it: every reference is linked only when the viewer may
 * see its target. The one place the formatted-text pipeline runs, so the page and the preview API can't disagree.
 */
export async function formattedTextHtml(user: User | null, project: TextProject, text: string): Promise<string> {
  const issueNumbers = issueReferenceNumbers(text);
  const wikiTargets = wikiReferenceTargets(text);
  const revisionIds = revisionReferenceIds(text);
  const [issues, wikiPages, revisions] = await Promise.all([
    issueNumbers.length > 0 ? resolveIssueLinks(user, issueNumbers) : new Map(),
    wikiTargets.length > 0 ? resolveWikiLinks(user, project, wikiTargets) : new Map(),
    revisionIds.length > 0 ? resolveRevisionLinks(user, project, revisionIds) : new Map(),
  ]);
  return renderFormattedText(text, { issues, wikiPages, revisions });
}
