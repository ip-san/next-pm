export interface NestedSetNode {
  id: string;
  lft: number;
  rgt: number;
}

export interface InsertPlan {
  /** Existing nodes whose lft/rgt must be updated to make room for the new node. */
  shifted: NestedSetNode[];
  newNode: { lft: number; rgt: number };
}

/**
 * Plans inserting a new node as the rightmost child of `parent` (or as a new root
 * when `parent` is null), following the standard nested-set "insert as last child"
 * algorithm that Redmine gets from awesome_nested_set:
 *   1. threshold = parent.rgt (or max(rgt)+1 across the whole forest for a root)
 *   2. every existing node with lft/rgt >= threshold shifts right by 2
 *   3. the new node takes lft = threshold, rgt = threshold + 1
 * Pure and DB-free by design — the caller (a Drizzle repository) is responsible for
 * persisting `shifted` and inserting `newNode` inside one transaction.
 */
export function planInsert(nodes: NestedSetNode[], parent: NestedSetNode | null): InsertPlan {
  if (parent === null) {
    const maxRgt = nodes.reduce((max, node) => Math.max(max, node.rgt), 0);
    return { shifted: nodes, newNode: { lft: maxRgt + 1, rgt: maxRgt + 2 } };
  }

  const threshold = parent.rgt;
  const shifted = nodes.map((node) => ({
    ...node,
    lft: node.lft >= threshold ? node.lft + 2 : node.lft,
    rgt: node.rgt >= threshold ? node.rgt + 2 : node.rgt,
  }));

  return { shifted, newNode: { lft: threshold, rgt: threshold + 1 } };
}

/** True if `descendant` is inside `ancestor`'s subtree (or is the ancestor itself). */
export function isWithinSubtree(ancestor: NestedSetNode, descendant: NestedSetNode): boolean {
  return descendant.lft >= ancestor.lft && descendant.rgt <= ancestor.rgt;
}
