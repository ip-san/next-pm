"use client";

import { useActionState } from "react";
import {
  deleteEnumerationAction,
  reorderEnumerationAction,
  updateEnumerationAction,
} from "@/interface/actions/admin-enumeration-actions";
import type { AdminActionState } from "@/interface/actions/admin-action-state";
import type { Enumeration } from "@/domain/enumeration/entity";

const initialState: AdminActionState = { error: null };

const moveLabels = [
  ["highest", "最上位へ", "⇈"],
  ["higher", "上へ", "↑"],
  ["lower", "下へ", "↓"],
  ["lowest", "最下位へ", "⇊"],
] as const;

/**
 * One row of an enumeration list: rename / default flag inline, reorder, and delete.
 *
 * Delete carries a reassignment select because Redmine's EnumerationsController#destroy only
 * removes an unused row outright — an in-use one needs a `reassign_to` whose objects it takes
 * over. The select is always shown so the admin doesn't have to retry after being refused.
 */
export function EnumerationRow({
  enumeration,
  reassignCandidates,
}: {
  enumeration: Enumeration;
  reassignCandidates: Enumeration[];
}) {
  const [updateState, updateFormAction, updating] = useActionState(updateEnumerationAction, initialState);
  const [reorderState, reorderFormAction, reordering] = useActionState(reorderEnumerationAction, initialState);
  const [deleteState, deleteFormAction, deleting] = useActionState(deleteEnumerationAction, initialState);
  const error = updateState.error ?? reorderState.error ?? deleteState.error;

  return (
    <li className="flex flex-wrap items-center gap-3 border-b py-2 text-sm">
      <form action={updateFormAction} className="flex items-center gap-2">
        <input type="hidden" name="enumerationId" value={enumeration.id} />
        <input
          name="name"
          required
          maxLength={30}
          defaultValue={enumeration.name}
          aria-label="名称"
          className="border rounded px-2 py-1"
        />
        <label className="flex items-center gap-1">
          <input type="checkbox" name="isDefault" defaultChecked={enumeration.isDefault} />
          既定値
        </label>
        <button type="submit" disabled={updating} className="border rounded px-2 py-1 disabled:opacity-50">
          {updating ? "保存中…" : "保存"}
        </button>
      </form>

      <form action={reorderFormAction} className="flex items-center gap-1">
        <input type="hidden" name="enumerationId" value={enumeration.id} />
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

      <form
        action={deleteFormAction}
        className="flex items-center gap-2"
        onSubmit={(event) => {
          if (!window.confirm(`「${enumeration.name}」を削除しますか?`)) event.preventDefault();
        }}
      >
        <input type="hidden" name="enumerationId" value={enumeration.id} />
        <select name="reassignToId" defaultValue="" aria-label="付け替え先" className="border rounded px-2 py-1">
          <option value="">付け替え先なし</option>
          {reassignCandidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={deleting} className="text-red-700 underline disabled:opacity-50">
          {deleting ? "削除中…" : "削除"}
        </button>
      </form>

      {error ? (
        <span role="alert" className="text-red-600">
          {error}
        </span>
      ) : null}
    </li>
  );
}
