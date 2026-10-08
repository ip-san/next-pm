export class InvalidBoardError extends Error {}

/** Mirrors Board's validates_presence_of/length_of :name (max 30), :description (max 255). */
export function validateBoardFields(name: string, description: string): void {
  if (name.trim().length === 0 || name.length > 30) {
    throw new InvalidBoardError("名前は1〜30文字で入力してください。");
  }
  if (description.trim().length === 0 || description.length > 255) {
    throw new InvalidBoardError("説明は1〜255文字で入力してください。");
  }
}
