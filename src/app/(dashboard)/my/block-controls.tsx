"use client";

import { useActionState } from "react";
import {
  moveMyPageBlockAction,
  moveMyPageBlockToGroupAction,
  removeMyPageBlockAction,
  type MyPageActionState,
} from "@/interface/actions/my-page-actions";
import type { MyPageBlockType, MyPageGroup } from "@/domain/my-page/entity";

const initialState: MyPageActionState = { error: null };

const GROUP_LABEL: Record<MyPageGroup, string> = { top: "上段", left: "左", right: "右" };

export function BlockControls({
  block,
  group,
  isFirst,
  isLast,
}: {
  block: MyPageBlockType;
  group: MyPageGroup;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [moveState, moveAction] = useActionState(moveMyPageBlockAction, initialState);
  const [groupState, groupAction] = useActionState(moveMyPageBlockToGroupAction, initialState);
  const [removeState, removeAction] = useActionState(removeMyPageBlockAction, initialState);
  const otherGroups = (["top", "left", "right"] as MyPageGroup[]).filter((g) => g !== group);

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <form action={moveAction} className="flex gap-1">
        <input type="hidden" name="block" value={block} />
        <button type="submit" name="direction" value="up" disabled={isFirst} className="disabled:opacity-30" aria-label="上へ移動">
          ↑
        </button>
        <button type="submit" name="direction" value="down" disabled={isLast} className="disabled:opacity-30" aria-label="下へ移動">
          ↓
        </button>
      </form>
      <form action={groupAction} className="flex gap-1">
        <input type="hidden" name="block" value={block} />
        {otherGroups.map((g) => (
          <button key={g} type="submit" name="group" value={g} className="underline">
            {GROUP_LABEL[g]}へ
          </button>
        ))}
      </form>
      <form action={removeAction}>
        <input type="hidden" name="block" value={block} />
        <button type="submit" aria-label="ブロックを削除">
          ×
        </button>
      </form>
      {moveState.error || groupState.error || removeState.error ? (
        <span className="text-red-600">{moveState.error ?? groupState.error ?? removeState.error}</span>
      ) : null}
    </div>
  );
}
