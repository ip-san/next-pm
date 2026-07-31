import { isWithinSubtree, type NestedSetNode } from "@/domain/project/nested-set";
import type { VersionSharing } from "./entity";

/**
 * Mirrors Redmine's Version#shared_with? — is a version owned by `owner` (with sharing
 * `sharing`) assignable from `target`? `ownerRoot`/`targetRoot` are the tree-root project
 * (self, if the project itself has no parent) of `owner`/`target` respectively — needed only
 * for the "tree" case, where sharing extends to every project under the same root.
 */
export function isVersionSharedWith(
  owner: NestedSetNode,
  target: NestedSetNode,
  sharing: VersionSharing,
  ownerRoot: NestedSetNode,
  targetRoot: NestedSetNode,
): boolean {
  if (owner.id === target.id) {
    return true;
  }
  switch (sharing) {
    case "none":
      return false;
    case "descendants":
      return isWithinSubtree(owner, target);
    case "hierarchy":
      return isWithinSubtree(owner, target) || isWithinSubtree(target, owner);
    case "tree":
      return ownerRoot.id === targetRoot.id;
    case "system":
      return true;
    default:
      return false;
  }
}
