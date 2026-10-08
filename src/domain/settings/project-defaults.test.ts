import { describe, expect, it } from "bun:test";
import { resolveProjectDefaults, serializeDefaultTrackerIds } from "./project-defaults";

describe("resolveProjectDefaults", () => {
  it("falls back to next-pm's prior new-project form behavior when nothing is persisted", () => {
    const defaults = resolveProjectDefaults({});
    expect(defaults.isPublic).toBe(true);
    expect(defaults.enabledModules).toEqual(["issue_tracking"]);
    expect(defaults.trackerIds).toBeNull();
    expect(defaults.sequentialIdentifiers).toBe(false);
    expect(defaults.newProjectUserRoleId).toBeNull();
  });

  it("applies persisted overrides", () => {
    const defaults = resolveProjectDefaults({
      default_projects_public: "0",
      default_projects_modules: "wiki,news",
      default_projects_tracker_ids: "t-1,t-2",
      sequential_project_identifiers: "1",
      new_project_user_role_id: "role-1",
    });
    expect(defaults.isPublic).toBe(false);
    expect(defaults.enabledModules).toEqual(["wiki", "news"]);
    expect(defaults.trackerIds).toEqual(["t-1", "t-2"]);
    expect(defaults.sequentialIdentifiers).toBe(true);
    expect(defaults.newProjectUserRoleId).toBe("role-1");
  });

  it("drops module names that are not registered project modules", () => {
    expect(resolveProjectDefaults({ default_projects_modules: "wiki,not_a_module" }).enabledModules).toEqual(["wiki"]);
  });

  it("tells an empty tracker selection apart from an unset one", () => {
    expect(resolveProjectDefaults({ default_projects_tracker_ids: serializeDefaultTrackerIds([]) }).trackerIds).toEqual([]);
    expect(resolveProjectDefaults({ default_projects_tracker_ids: serializeDefaultTrackerIds(null) }).trackerIds).toBeNull();
  });
});
