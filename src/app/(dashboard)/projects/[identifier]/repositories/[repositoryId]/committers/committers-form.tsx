"use client";

import { useActionState } from "react";
import { mapCommittersAction, type ScmActionState } from "@/interface/actions/scm-actions";

const initialState: ScmActionState = { error: null };

export interface CommitterRow {
  committerIdentity: string;
  userId: string | null;
  /** How many of the repository's changesets carry this committer string. */
  changesetCount: number;
}

export interface AssignableUser {
  id: string;
  label: string;
}

/**
 * Redmine's repositories/committers form: one row per distinct committer string in this
 * repository's changesets, each with a user select whose blank option unmaps the committer.
 */
export function CommittersForm({
  projectIdentifier,
  scmRepositoryId,
  committers,
  users,
}: {
  projectIdentifier: string;
  scmRepositoryId: string;
  committers: CommitterRow[];
  users: AssignableUser[];
}) {
  const [state, formAction, pending] = useActionState(mapCommittersAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 items-start">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="scmRepositoryId" value={scmRepositoryId} />
      <table className="text-sm w-full max-w-3xl">
        <thead>
          <tr className="text-left border-b">
            <th className="pb-2">コミッタ</th>
            <th className="pb-2">コミット数</th>
            <th className="pb-2">ユーザー</th>
          </tr>
        </thead>
        <tbody>
          {committers.map((committer) => {
            const selectId = `committer-${encodeURIComponent(committer.committerIdentity)}`;
            return (
              <tr key={committer.committerIdentity} className="border-b">
                <td className="py-2 font-mono text-xs break-all">
                  {committer.committerIdentity}
                  <input type="hidden" name="committerIdentity" value={committer.committerIdentity} />
                </td>
                <td className="py-2">{committer.changesetCount}</td>
                <td className="py-2">
                  <label className="sr-only" htmlFor={selectId}>
                    {committer.committerIdentity} に対応するユーザー
                  </label>
                  <select
                    id={selectId}
                    name={`userId:${committer.committerIdentity}`}
                    defaultValue={committer.userId ?? ""}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    <option value="">（紐付けない）</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50">
        保存
      </button>
    </form>
  );
}
