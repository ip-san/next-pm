export class InvalidNewsError extends Error {}

/** Mirrors News' validates_presence_of :title/:description, validates_length_of :title (max 60), :summary (max 255). */
export function validateNewsFields(title: string, summary: string, description: string): void {
  if (title.trim().length === 0 || title.length > 60) {
    throw new InvalidNewsError("タイトルは1〜60文字で入力してください。");
  }
  if (summary.length > 255) {
    throw new InvalidNewsError("概要は255文字以内で入力してください。");
  }
  if (description.trim().length === 0) {
    throw new InvalidNewsError("本文を入力してください。");
  }
}
