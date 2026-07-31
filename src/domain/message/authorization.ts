import type { Message } from "./entity";

/** Port of Message#editable_by?/destroyable_by? — the *_own_* permission only covers the author's own posts. */
export function canEditMessage(message: Pick<Message, "authorId">, userId: string, hasEditMessages: boolean, hasEditOwnMessages: boolean): boolean {
  return hasEditMessages || (message.authorId === userId && hasEditOwnMessages);
}

export function canDeleteMessage(message: Pick<Message, "authorId">, userId: string, hasDeleteMessages: boolean, hasDeleteOwnMessages: boolean): boolean {
  return hasDeleteMessages || (message.authorId === userId && hasDeleteOwnMessages);
}
