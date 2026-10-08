import { describe, expect, it } from "bun:test";
import { PERMISSION_REGISTRY, PROJECT_MODULES } from "./permission-registry";

describe("PROJECT_MODULES", () => {
  it("covers exactly the modules the registry gates permissions on", () => {
    const fromRegistry = new Set(Object.values(PERMISSION_REGISTRY).flatMap((def) => (def.module ? [def.module] : [])));
    expect([...fromRegistry].sort()).toEqual([...PROJECT_MODULES].sort());
  });
});
