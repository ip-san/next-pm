"use client";

import type { Locale } from "@/domain/i18n/locales";
import { interpolate, translate, type MessageKey } from "@/domain/i18n/messages";
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
  ["highest", "admin.move.highest", "⇈"],
  ["higher", "admin.move.higher", "↑"],
  ["lower", "admin.move.lower", "↓"],
  ["lowest", "admin.move.lowest", "⇊"],
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
  locale = "ja",
}: {
  enumeration: Enumeration;
  reassignCandidates: Enumeration[];
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
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
          aria-label={t("admin.trackers.name")}
          className="border rounded px-2 py-1"
        />
        <label className="flex items-center gap-1">
          <input type="checkbox" name="isDefault" defaultChecked={enumeration.isDefault} />
          {t("admin.enumerations.isDefault")}
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="active" defaultChecked={enumeration.active} />
          {t("admin.statusActive")}
        </label>
        <button type="submit" disabled={updating} className="border rounded px-2 py-1 disabled:opacity-50">
          {updating ? t("issue.saving") : t("issue.save")}
        </button>
      </form>

      <form action={reorderFormAction} className="flex items-center gap-1">
        <input type="hidden" name="enumerationId" value={enumeration.id} />
        {moveLabels.map(([move, labelKey, glyph]) => (
          <button
            key={move}
            type="submit"
            name="move"
            value={move}
            title={t(labelKey)}
            aria-label={t(labelKey)}
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
          if (!window.confirm(interpolate(t("admin.enumerations.deleteConfirm"), { name: enumeration.name }))) event.preventDefault();
        }}
      >
        <input type="hidden" name="enumerationId" value={enumeration.id} />
        <select name="reassignToId" defaultValue="" aria-label={t("admin.enumerations.reassignTo")} className="border rounded px-2 py-1">
          <option value="">{t("admin.enumerations.reassignNone")}</option>
          {reassignCandidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={deleting} className="text-red-700 underline disabled:opacity-50">
          {deleting ? t("admin.deleting") : t("issue.delete")}
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
