export class InvalidDocumentError extends Error {}

/** Mirrors Document's validates_presence_of :title/:category, validates_length_of :title (max 255). */
export function validateDocumentFields(title: string, categoryId: string): void {
  if (title.trim().length === 0 || title.length > 255) {
    throw new InvalidDocumentError("タイトルは1〜255文字で入力してください。");
  }
  if (categoryId.trim().length === 0) {
    throw new InvalidDocumentError("カテゴリを選択してください。");
  }
}
