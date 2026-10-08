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

describe("customFieldChoiceOptions for enumeration fields", () => {
  it("offers the active choices in position order, with the choice id as the value", () => {
    const options = customFieldChoiceOptions(
      [
        {
          id: "f-enum",
          fieldFormat: "enumeration",
          enumerations: [
            { id: "c-2", name: "High", position: 2, active: true },
            { id: "c-1", name: "Low", position: 1, active: true },
            { id: "c-0", name: "Retired", position: 0, active: false },
          ],
        },
      ],
      { users: [], versions: [] },
    );
    expect(options["f-enum"]).toEqual([
      { value: "c-1", label: "Low" },
      { value: "c-2", label: "High" },
    ]);
  });
});
