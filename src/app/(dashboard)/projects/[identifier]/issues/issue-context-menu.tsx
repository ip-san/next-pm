"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkUpdateIssuesAction } from "@/interface/actions/bulk-edit-actions";
import type { Locale } from "@/domain/i18n/locales";
import { interpolate, translate, type MessageKey } from "@/domain/i18n/messages";

export interface ContextMenuOption {
  id: string;
  name: string;
}

export interface IssueContextMenuPermissions {
  edit: boolean;
  copy: boolean;
  delete: boolean;
}

/**
 * Redmine's ContextMenusController#issues: right-clicking the issue list offers the common
 * single-field changes plus the bulk actions, applied to the checked rows — or to the row
 * under the cursor when nothing is checked, which is what Redmine does when you right-click
 * an unselected row.
 *
 * The quick changes go through the same bulkUpdateIssuesAction the bulk-edit form uses, so
 * every permission, workflow transition and validation applies identically; the menu never
 * writes anything itself. Entries are only rendered for permissions the viewer holds, and
 * the action re-checks them per issue regardless.
 */
export function IssueContextMenu({
  projectIdentifier,
  basePath,
  statuses,
  trackers,
  priorities,
  assignees,
  versions,
  permissions,
  locale,
}: {
  projectIdentifier: string;
  basePath: string;
  statuses: ContextMenuOption[];
  trackers: ContextMenuOption[];
  priorities: ContextMenuOption[];
  /** Users and groups, already formatted as the bulk-edit control expects (`group:<id>`). */
  assignees: ContextMenuOption[];
  versions: ContextMenuOption[];
  permissions: IssueContextMenuPermissions;
  locale: Locale;
}) {
  const router = useRouter();
  const t = (key: MessageKey) => translate(locale, key);
  const [menu, setMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onContextMenu(event: MouseEvent) {
      const row = (event.target as HTMLElement | null)?.closest?.("tr[data-issue-id]") as HTMLElement | null;
      if (!row) return;
      event.preventDefault();

      const table = row.closest("table");
      const checked = [...(table?.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked') ?? [])].map((input) => input.value);
      const rowId = row.dataset.issueId!;
      // Right-clicking a row that isn't part of the selection acts on that row alone.
      const ids = checked.includes(rowId) ? checked : [rowId];
      setError(null);
      setMenu({ x: event.clientX, y: event.clientY, ids });
    }
    function onDismiss(event: MouseEvent) {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("click", onDismiss);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("click", onDismiss);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!menu) return null;

  async function apply(field: string, value: string) {
    if (!menu) return;
    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("projectIdentifier", projectIdentifier);
    for (const id of menu.ids) formData.append("issueIds", id);
    formData.set(field, value);
    const result = await bulkUpdateIssuesAction({ error: null, message: null }, formData);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMenu(null);
    router.refresh();
  }

  const selection = menu.ids;
  const picker = (label: string, field: string, options: ContextMenuOption[], extra?: ContextMenuOption) => (
    <label className="flex items-center justify-between gap-2 px-3 py-1 text-sm hover:bg-gray-100">
      <span>{label}</span>
      <select
        defaultValue=""
        disabled={pending}
        onChange={(event) => event.target.value && apply(field, event.target.value)}
        className="border rounded px-1 py-0.5 text-xs"
      >
        <option value="">—</option>
        {extra ? <option value={extra.id}>{extra.name}</option> : null}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t("issue.menuLabel")}
      style={{ top: menu.y, left: menu.x }}
      className="fixed z-50 min-w-56 bg-white border rounded shadow-lg py-1"
    >
      <p className="px-3 py-1 text-xs text-gray-500">{interpolate(t("issue.menuSelected"), { count: selection.length })}</p>

      {permissions.edit ? (
        <>
          {picker(t("issue.attr.statusId"), "statusId", statuses)}
          {picker(t("issue.attr.trackerId"), "trackerId", trackers)}
          {picker(t("issue.attr.priorityId"), "priorityId", priorities)}
          {picker(t("issue.attr.assignedToId"), "assignedToId", assignees, { id: "__none__", name: t("issue.unassigned") })}
          {picker(t("issue.attr.fixedVersionId"), "fixedVersionId", versions, { id: "__none__", name: t("issue.none") })}
          {picker(
            t("issue.attr.doneRatio"),
            "doneRatio",
            Array.from({ length: 11 }, (_, index) => ({ id: String(index * 10), name: `${index * 10} %` })),
          )}
        </>
      ) : null}

      {error ? (
        <p role="alert" className="px-3 py-1 text-xs text-red-600">
          {error}
        </p>
      ) : null}

      <div className="border-t mt-1 pt-1 flex flex-col">
        {permissions.edit ? (
          <Link href={`${basePath}/bulk-edit?${selection.map((id) => `ids=${id}`).join("&")}`} className="px-3 py-1 text-sm hover:bg-gray-100">
            {t("issue.bulkEdit")}
          </Link>
        ) : null}
        {permissions.copy && selection.length === 1 ? (
          <Link href={`${basePath}/${selection[0]}`} className="px-3 py-1 text-sm hover:bg-gray-100">
            {t("issue.copyFromSingle")}
          </Link>
        ) : null}
        {permissions.delete && selection.length === 1 ? (
          <Link href={`${basePath}/${selection[0]}/destroy`} className="px-3 py-1 text-sm text-red-700 hover:bg-gray-100">
            {t("issue.deleteMenu")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
