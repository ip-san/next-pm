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

export interface DeletePlan {
  /** The removed node and every descendant, deepest first — the order a parent_id FK with ON DELETE RESTRICT needs. */
  removed: NestedSetNode[];
  /** Surviving nodes whose lft/rgt must be rewritten to close the gap the removal leaves. */
  shifted: NestedSetNode[];
}

/**
 * Plans removing `removed` and its whole subtree, the mirror of `planInsert`: the subtree
 * occupies `width = rgt - lft + 1` slots, and every bound to the right of it moves left by
 * that width so the forest stays gapless. Redmine gets this from awesome_nested_set's
 * destroy callback; leaving the gap instead would still *work* (`isWithinSubtree` only
 * compares bounds) but would let the numbers drift upward forever and makes a stray
 * `max(rgt)` root insert the only safe way to add anything.
 */
export function planDelete(nodes: NestedSetNode[], removed: NestedSetNode): DeletePlan {
  const subtree = nodes.filter((node) => isWithinSubtree(removed, node));
  const width = removed.rgt - removed.lft + 1;
  const survivors = nodes.filter((node) => !isWithinSubtree(removed, node));

  return {
    // Deepest first: a child must go before the parent its parent_id still points at.
    removed: [...subtree].sort((a, b) => b.lft - a.lft),
    shifted: survivors.map((node) => ({
      ...node,
      lft: node.lft > removed.rgt ? node.lft - width : node.lft,
      rgt: node.rgt > removed.rgt ? node.rgt - width : node.rgt,
    })),
  };
}

/** True if `descendant` is inside `ancestor`'s subtree (or is the ancestor itself). */
export function isWithinSubtree(ancestor: NestedSetNode, descendant: NestedSetNode): boolean {
  return descendant.lft >= ancestor.lft && descendant.rgt <= ancestor.rgt;
}
