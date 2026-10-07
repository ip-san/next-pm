import type { Attachment } from "@/domain/attachment/entity";
import type { JournalRepository } from "@/domain/journal/repository";

export interface JournalizeAttachmentInput {
  issueId: string;
  userId: string;
  attachment: Pick<Attachment, "id" | "filename">;
  change: "added" | "removed";
}

/**
 * Mirrors Journal#journalize_attachment (property 'attachment', prop_key = the attachment id,
 * the filename in `value` when added and in `old_value` when removed), which Issue triggers
 * from its acts_as_attachable after_add/after_remove callbacks.
 */
export async function journalizeAttachment(
  repositories: { journalRepository: JournalRepository },
  input: JournalizeAttachmentInput,
): Promise<void> {
  await repositories.journalRepository.create({
    journalizedType: "Issue",
    journalizedId: input.issueId,
    userId: input.userId,
    notes: "",
    // An attachment entry carries no note, so there is nothing for private_notes to hide.
    privateNotes: false,
    details: [
      {
        property: "attachment",
        fieldName: input.attachment.id,
        oldValue: input.change === "removed" ? input.attachment.filename : null,
        newValue: input.change === "added" ? input.attachment.filename : null,
      },
    ],
  });
}
