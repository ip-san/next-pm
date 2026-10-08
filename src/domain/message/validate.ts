export class InvalidMessageError extends Error {}
export class LockedTopicError extends Error {}

/** Mirrors Message's validates_presence_of :subject/:content and validates_length_of :subject (max 255). */
export function validateMessageFields(subject: string, content: string): void {
  if (subject.trim().length === 0 || subject.length > 255) {
    throw new InvalidMessageError("件名は1〜255文字で入力してください。");
  }
  if (content.trim().length === 0) {
    throw new InvalidMessageError("本文を入力してください。");
  }
}
