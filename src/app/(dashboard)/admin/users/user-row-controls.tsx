"use client";

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
export function UserRowControls({ user, isSelf }: { user: User; isSelf: boolean }) {
  const [statusState, statusFormAction, changing] = useActionState(changeUserStatusAction, initialState);
  const [deleteState, deleteFormAction, deleting] = useActionState(deleteUserAction, initialState);
  const error = statusState.error ?? deleteState.error;

  return (
    <span className="flex items-center gap-3 text-sm">
      <Link href={`/admin/users/${user.id}`} className="text-blue-700 underline">
        編集
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
              {user.status === "active" ? "ロック" : user.status === "locked" ? "ロック解除" : "有効化"}
            </button>
          </form>
          <form
            action={deleteFormAction}
            onSubmit={(event) => {
              if (
                !window.confirm(
                  `ユーザー「${user.login}」を削除しますか? 作成したチケットなどは匿名ユーザーに引き継がれます。`,
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="userId" value={user.id} />
            <button type="submit" disabled={deleting} className="text-red-700 underline disabled:opacity-50">
              {deleting ? "削除中…" : "削除"}
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
