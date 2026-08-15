export class CustomFieldValidationError extends Error {
  constructor(public readonly fieldErrors: Record<string, string>) {
    super("One or more custom field values are invalid");
    this.name = "CustomFieldValidationError";
  }
}
