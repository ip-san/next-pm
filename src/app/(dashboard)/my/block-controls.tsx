"use client";

import { interpolate } from "@/domain/i18n/messages";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import {
  moveMyPageBlockAction,
  moveMyPageBlockToGroupAction,
  removeMyPageBlockAction,
  type MyPageActionState,
} from "@/interface/actions/my-page-actions";
import type { MyPageBlockType, MyPageGroup } from "@/domain/my-page/entity";

const initialState: MyPageActionState = { error: null };

const GROUP_LABEL: Record<MyPageGroup, MessageKey> = { top: "my.groupTop", left: "my.groupLeft", right: "my.groupRight" };

export function BlockControls({
  block,
  group,
  isFirst,
  isLast,
  locale = "ja",
}: {
  block: MyPageBlockType;
  group: MyPageGroup;
  isFirst: boolean;
  isLast: boolean;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [moveState, moveAction] = useActionState(moveMyPageBlockAction, initialState);
  const [groupState, groupAction] = useActionState(moveMyPageBlockToGroupAction, initialState);
  const [removeState, removeAction] = useActionState(removeMyPageBlockAction, initialState);
  const otherGroups = (["top", "left", "right"] as MyPageGroup[]).filter((g) => g !== group);

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <form action={moveAction} className="flex gap-1">
        <input type="hidden" name="block" value={block} />
        <button type="submit" name="direction" value="up" disabled={isFirst} className="disabled:opacity-30" aria-label={t("my.moveUp")}>
          ↑
        </button>
        <button type="submit" name="direction" value="down" disabled={isLast} className="disabled:opacity-30" aria-label={t("my.moveDown")}>
          ↓
        </button>
      </form>
      <form action={groupAction} className="flex gap-1">
        <input type="hidden" name="block" value={block} />
        {otherGroups.map((g) => (
          <button key={g} type="submit" name="group" value={g} className="underline">
            {interpolate(t("my.moveTo"), { group: translate(locale, GROUP_LABEL[g]) })}
          </button>
        ))}
      </form>
      <form action={removeAction}>
        <input type="hidden" name="block" value={block} />
        <button type="submit" aria-label={t("my.removeBlock")}>
          ×
        </button>
      </form>
      {moveState.error || groupState.error || removeState.error ? (
        <span className="text-red-600">{moveState.error ?? groupState.error ?? removeState.error}</span>
      ) : null}
    </div>
  );
}
