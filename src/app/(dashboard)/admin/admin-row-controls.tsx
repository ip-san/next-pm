"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AdminActionState } from "@/interface/actions/admin-action-state";

/** Every admin Server Action shares this shape, so one control strip can drive all the master lists. */
export type AdminAction = (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;

const initialState: AdminActionState = { error: null };

const moveLabels = [
  ["highest", "最上位へ", "⇈"],
  ["higher", "上へ", "↑"],
  ["lower", "下へ", "↓"],
  ["lowest", "最下位へ", "⇊"],
] as const;

/**
 * Reorder + delete controls for one row of an admin master list.
 *
 * `idField` is the FormData key the row id travels under, which differs per entity (statusId,
 * trackerId, …) because each entity has its own action module.
 */
export function AdminRowControls({
  id,
  idField,
  editHref,
  reorderAction,
  deleteAction,
  deleteConfirm,
}: {
  id: string;
  idField: string;
  editHref?: string;
  reorderAction?: AdminAction;
  deleteAction?: AdminAction;
  deleteConfirm?: string;
}) {
  const [reorderState, reorderFormAction, reordering] = useActionState(
    reorderAction ?? noopAction,
    initialState,
  );
  const [deleteState, deleteFormAction, deleting] = useActionState(deleteAction ?? noopAction, initialState);
  const error = reorderState.error ?? deleteState.error;

  return (
    <span className="flex items-center gap-2 text-sm">
      {editHref ? (
        <Link href={editHref} className="text-blue-700 underline">
          編集
        </Link>
      ) : null}
      {reorderAction ? (
        <form action={reorderFormAction} className="flex items-center gap-1">
          <input type="hidden" name={idField} value={id} />
          {moveLabels.map(([move, label, glyph]) => (
            <button
              key={move}
              type="submit"
              name="move"
              value={move}
              title={label}
              aria-label={label}
              disabled={reordering}
              className="border rounded px-1 leading-none disabled:opacity-50"
            >
              {glyph}
            </button>
          ))}
        </form>
      ) : null}
      {deleteAction ? (
        <form
          action={deleteFormAction}
          onSubmit={(event) => {
            if (deleteConfirm && !window.confirm(deleteConfirm)) event.preventDefault();
          }}
        >
          <input type="hidden" name={idField} value={id} />
          <button type="submit" disabled={deleting} className="text-red-700 underline disabled:opacity-50">
            {deleting ? "削除中…" : "削除"}
          </button>
        </form>
      ) : null}
      {error ? (
        <span role="alert" className="text-red-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}

async function noopAction(state: AdminActionState): Promise<AdminActionState> {
  return state;
}
