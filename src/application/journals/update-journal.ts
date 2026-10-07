import { can, projectAuthorizationContext, type AuthorizationActor } from "@/domain/authorization/authorization-service";
import type { IssueRepository } from "@/domain/issue/repository";
import type { Journal } from "@/domain/journal/entity";
import type { JournalRepository } from "@/domain/journal/repository";
import { isJournalVisible, type JournalViewer } from "@/domain/journal/visibility";
import type { ProjectRepository } from "@/domain/project/repository";

export class JournalNotEditableError extends Error {
  constructor() {
    super("The acting user may not edit this note.");
    this.name = "JournalNotEditableError";
  }
}

export interface UpdateJournalRepositories {
  journalRepository: JournalRepository;
  issueRepository: IssueRepository;
  projectRepository: ProjectRepository;
}

export interface UpdateJournalInput {
  journalId: string;
  notes: string;
  /** Honoured only with `set_notes_private`; the existing flag is kept otherwise. */
  privateNotes: boolean;
  actingUserId: string;
  actor: AuthorizationActor;
  viewer: JournalViewer;
}

export type UpdateJournalResult = { deleted: true; issueId: string } | { deleted: false; journal: Journal };

/**
 * Port of Redmine's JournalsController#update together with `Journal#editable_by?`:
 *
 *     usr.logged? && (allowed_to?(:edit_issue_notes) || (journal.user == usr && allowed_to?(:edit_own_issue_notes)))
 *
 * Redmine loads the journal through `Journal.visible`, so a private note the actor can't
 * read can't be edited either, even with `edit_issue_notes` — that check is here too, and
 * it reports the journal as missing rather than forbidden.
 *
 * Deleting: Redmine has no journal destroy at all (`resources :journals, only: [:edit,
 * :update]`), and blanking the notes of a journal with no details leaves an empty row that
 * its views then skip. next-pm deletes that row instead — the same thing a reader sees,
 * without accumulating empty history entries.
 */
export async function updateJournal(
  repositories: UpdateJournalRepositories,
  input: UpdateJournalInput,
): Promise<UpdateJournalResult> {
  const journal = await repositories.journalRepository.findById(input.journalId, input.viewer);
  if (!journal || !isJournalVisible(journal, input.viewer)) {
    throw new JournalNotEditableError();
  }

  // The issue comes from the journal, never from a caller-supplied id.
  const issue = await repositories.issueRepository.findById(journal.journalizedId);
  if (!issue) {
    throw new JournalNotEditableError();
  }
  const project = await repositories.projectRepository.findById(issue.projectId);
  if (!project) {
    throw new JournalNotEditableError();
  }
  const projectContext = projectAuthorizationContext(project);

  const mayEdit =
    can({ permission: "edit_issue_notes", project: projectContext, actor: input.actor }) ||
    (journal.userId === input.actingUserId &&
      can({ permission: "edit_own_issue_notes", project: projectContext, actor: input.actor }));
  if (!mayEdit) {
    throw new JournalNotEditableError();
  }

  // Changing the private flag is its own permission; without it the note keeps whatever it
  // had, so an editor can't quietly publish someone's private note or hide a public one.
  const privateNotes = can({ permission: "set_notes_private", project: projectContext, actor: input.actor })
    ? input.privateNotes
    : journal.privateNotes;

  if (input.notes.trim().length === 0 && journal.details.length === 0) {
    await repositories.journalRepository.delete(input.journalId);
    return { deleted: true, issueId: issue.id };
  }

  // A blank note is never private — the same rule split_private_notes applies on create.
  const updated = await repositories.journalRepository.update(input.journalId, {
    notes: input.notes,
    privateNotes: input.notes.trim().length === 0 ? false : privateNotes,
    updatedById: input.actingUserId,
  });
  return { deleted: false, journal: updated };
}
