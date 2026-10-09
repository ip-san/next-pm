"use client";

import type { Locale } from "@/domain/i18n/locales";
import { interpolate, translate, type MessageKey } from "@/domain/i18n/messages";
import Link from "next/link";
import { useActionState } from "react";
import { changeUserStatusAction, deleteUserAction } from "@/interface/actions/admin-user-actions";
import type { AdminActionState } from "@/interface/actions/admin-action-state";
import type { User } from "@/domain/user/entity";

const initialState: AdminActionState = { error: null };

/**
 * Lock / unlock / activate and delete for one user row.
 *
 * Redmine shows "activate" for a registered account, "unlock" for a locked one and "lock"
 * otherwise — all three are a status write, so one form with the target status covers them.
 * None of them is offered for the acting admin's own row, matching the `User.current`
 * exclusions in UsersController.
 */
export function UserRowControls({ locale = "ja", user, isSelf }: { user: User; isSelf: boolean; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [statusState, statusFormAction, changing] = useActionState(changeUserStatusAction, initialState);
  const [deleteState, deleteFormAction, deleting] = useActionState(deleteUserAction, initialState);
  const error = statusState.error ?? deleteState.error;

  return (
    <span className="flex items-center gap-3 text-sm">
      <Link href={`/admin/users/${user.id}`} className="text-blue-700 underline">
        {t("issue.edit")}
      </Link>
      {isSelf ? null : (
        <>
          <form action={statusFormAction}>
            <input type="hidden" name="userId" value={user.id} />
            <button
              type="submit"
              name="status"
              value={user.status === "active" ? "locked" : "active"}
              disabled={changing}
              className="underline disabled:opacity-50"
            >
              {user.status === "active" ? t("admin.users.lock") : user.status === "locked" ? t("admin.users.unlock") : t("admin.users.activate")}
            </button>
          </form>
          <form
            action={deleteFormAction}
            onSubmit={(event) => {
              if (
                !window.confirm(
                  interpolate(t("admin.users.deleteConfirm"), { login: user.login }),
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="userId" value={user.id} />
            <button type="submit" disabled={deleting} className="text-red-700 underline disabled:opacity-50">
              {deleting ? t("admin.deleting") : t("issue.delete")}
            </button>
          </form>
        </>
      )}
      {error ? (
        <span role="alert" className="text-red-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}
