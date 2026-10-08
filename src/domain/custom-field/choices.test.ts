import { describe, expect, it } from "bun:test";
import { customFieldChoiceOptions } from "./choices";

describe("customFieldChoiceOptions", () => {
  const users = [{ value: "u1", label: "Dev One" }];
  const versions = [{ value: "v1", label: "1.0" }];

  it("offers members to a user field and shared versions to a version field", () => {
    const options = customFieldChoiceOptions(
      [
        { id: "f-user", fieldFormat: "user" },
        { id: "f-version", fieldFormat: "version" },
        { id: "f-text", fieldFormat: "string" },
      ],
      { users, versions },
    );
    expect(options["f-user"]).toEqual(users);
    expect(options["f-version"]).toEqual(versions);
    expect(options["f-text"]).toBeUndefined();
  });
});
