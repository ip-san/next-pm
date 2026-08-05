import { MY_PAGE_GROUPS, type MyPageGroup, type MyPageLayout, type MyPageBlockType } from "./entity";

function withoutBlock(layout: MyPageLayout, block: MyPageBlockType): MyPageLayout {
  const next = {} as MyPageLayout;
  for (const group of MY_PAGE_GROUPS) {
    next[group] = layout[group].filter((b) => b !== block);
  }
  return next;
}

/** Mirrors UserPreference#add_block: removes any existing occurrence, then unshifts onto the first group ("top"). */
export function addBlock(layout: MyPageLayout, block: MyPageBlockType): MyPageLayout {
  const next = withoutBlock(layout, block);
  next[MY_PAGE_GROUPS[0]] = [block, ...next[MY_PAGE_GROUPS[0]]];
  return next;
}

/** Mirrors UserPreference#remove_block: deletes the block from every group. */
export function removeBlock(layout: MyPageLayout, block: MyPageBlockType): MyPageLayout {
  return withoutBlock(layout, block);
}

/**
 * Swaps a block with its neighbor within its own group — the accessible, button-driven
 * equivalent of Redmine's mouse-only jQuery UI drag-and-drop reordering (my/page.html.erb's
 * `.sortable()` has no keyboard/no-JS fallback at all).
 */
export function moveBlockWithinGroup(layout: MyPageLayout, group: MyPageGroup, block: MyPageBlockType, direction: "up" | "down"): MyPageLayout {
  const blocks = [...layout[group]];
  const index = blocks.indexOf(block);
  if (index === -1) return layout;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= blocks.length) return layout;
  [blocks[index], blocks[targetIndex]] = [blocks[targetIndex], blocks[index]];
  return { ...layout, [group]: blocks };
}

/** Moves a block to the end of a different column. */
export function moveBlockToGroup(layout: MyPageLayout, block: MyPageBlockType, toGroup: MyPageGroup): MyPageLayout {
  const next = withoutBlock(layout, block);
  next[toGroup] = [...next[toGroup], block];
  return next;
}

/** Which group (if any) currently contains `block`. */
export function findBlockGroup(layout: MyPageLayout, block: MyPageBlockType): MyPageGroup | null {
  return MY_PAGE_GROUPS.find((group) => layout[group].includes(block)) ?? null;
}
