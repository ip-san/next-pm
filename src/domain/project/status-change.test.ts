import { describe, expect, it } from "bun:test";
import type { ProjectStatus } from "./entity";
import { archiveBlockingVersionIds, planArchive, planClose, planReopen, planUnarchive } from "./status-change";

function node(id: string, lft: number, rgt: number, status: ProjectStatus = "active") {
  return { id, lft, rgt, status };
}

//   root (1,8)
//   ├── child (2,5)
//   │   └── grandchild (3,4)
//   └── sibling (6,7)
const root = node("root", 1, 8);
const child = node("child", 2, 5);
const grandchild = node("grandchild", 3, 4);
const sibling = node("sibling", 6, 7);
const tree = [root, child, grandchild, sibling];

describe("planArchive", () => {
  it("archives the whole subtree regardless of each project's current status", () => {
    const all = [root, { ...child, status: "closed" as const }, grandchild, sibling];
    const plan = planArchive(child, all);
    expect(plan.status).toBe("archived");
    expect(plan.projectIds.sort()).toEqual(["child", "grandchild"]);
  });
});

describe("archiveBlockingVersionIds", () => {
  const versions = [
    { id: "v-child", projectId: "child" },
    { id: "v-root", projectId: "root" },
  ];

  it("reports a version of the subtree that an issue outside the subtree is assigned to", () => {
    const issues = [{ projectId: "sibling", fixedVersionId: "v-child" }];
    expect(archiveBlockingVersionIds(child, tree, versions, issues)).toEqual(["v-child"]);
  });

  it("ignores issues inside the subtree, and issues on versions owned elsewhere", () => {
    const issues = [
      { projectId: "grandchild", fixedVersionId: "v-child" },
      { projectId: "sibling", fixedVersionId: "v-root" },
      { projectId: "sibling", fixedVersionId: null },
    ];
    expect(archiveBlockingVersionIds(child, tree, versions, issues)).toEqual([]);
  });
});

describe("planUnarchive", () => {
  it("unarchives the project and its archived ancestors, but not its descendants", () => {
    const all = [
      { ...root, status: "archived" as const },
      { ...child, status: "archived" as const },
      { ...grandchild, status: "archived" as const },
      sibling,
    ];
    const plan = planUnarchive(child, all);
    expect(plan.status).toBe("active");
    expect(plan.projectIds.sort()).toEqual(["child", "root"]);
  });

  it("reopens into closed rather than active when an ancestor is closed", () => {
    const all = [{ ...root, status: "closed" as const }, { ...child, status: "archived" as const }, grandchild, sibling];
    const plan = planUnarchive(child, all);
    expect(plan.status).toBe("closed");
    expect(plan.projectIds).toEqual(["child"]);
  });
});

describe("planClose / planReopen", () => {
  it("closes only the active projects in the subtree", () => {
    const all = [root, child, { ...grandchild, status: "closed" as const }, sibling];
    const plan = planClose(root, all);
    expect(plan.status).toBe("closed");
    expect(plan.projectIds.sort()).toEqual(["child", "root", "sibling"]);
  });

  it("reopens only the closed projects in the subtree, leaving archived ones alone", () => {
    const all = [
      { ...root, status: "closed" as const },
      { ...child, status: "closed" as const },
      { ...grandchild, status: "archived" as const },
      { ...sibling, status: "closed" as const },
    ];
    const plan = planReopen(root, all);
    expect(plan.status).toBe("active");
    expect(plan.projectIds.sort()).toEqual(["child", "root", "sibling"]);
  });
});
