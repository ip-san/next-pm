import { describe, expect, it } from "bun:test";
import { planArchive, planClose, planReopen, planUnarchive } from "./lifecycle";
import type { Project } from "./entity";

function p(id: string, status: Project["status"]): Pick<Project, "id" | "status"> {
  return { id, status };
}

describe("planClose", () => {
  it("closes only the active projects of the subtree", () => {
    const plan = planClose([p("root", "active"), p("child-active", "active"), p("child-closed", "closed"), p("child-archived", "archived")]);
    expect(plan).toEqual({ ids: ["root", "child-active"], status: "closed" });
  });
});

describe("planReopen", () => {
  it("reopens only the closed projects of the subtree, leaving archived ones alone", () => {
    const plan = planReopen([p("root", "closed"), p("child-closed", "closed"), p("child-archived", "archived")]);
    expect(plan).toEqual({ ids: ["root", "child-closed"], status: "active" });
  });
});

describe("planArchive", () => {
  it("archives the whole subtree regardless of current status", () => {
    const plan = planArchive([p("root", "active"), p("child-closed", "closed"), p("child-archived", "archived")]);
    expect(plan).toEqual({ ids: ["root", "child-closed", "child-archived"], status: "archived" });
  });
});

describe("planUnarchive", () => {
  it("restores the project itself to active when no ancestor is closed", () => {
    const plan = planUnarchive(p("self", "archived"), [p("parent", "active")]);
    expect(plan).toEqual({ ids: ["self"], status: "active" });
  });

  it("also restores archived ancestors — a project cannot be active under an archived parent", () => {
    const plan = planUnarchive(p("self", "archived"), [p("parent", "archived"), p("grandparent", "active")]);
    expect(plan).toEqual({ ids: ["self", "parent"], status: "active" });
  });

  it("restores to closed when an ancestor is closed", () => {
    const plan = planUnarchive(p("self", "archived"), [p("parent", "closed")]);
    expect(plan).toEqual({ ids: ["self"], status: "closed" });
  });
});
