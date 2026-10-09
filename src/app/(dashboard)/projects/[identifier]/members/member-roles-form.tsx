"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { updateMemberRolesAction, type MemberActionState } from "@/interface/actions/member-actions";
import type { Role } from "@/domain/role/entity";

const initialState: MemberActionState = { error: null };

/**
 * In-place role editing for one membership (Redmine's MembersController#update). Rows
 * materialized from a group membership are rendered read-only by the page instead — their
 * roles belong to the group.
 */
export function MemberRolesForm({
  projectIdentifier,
  memberId,
  roles,
  selectedRoleIds,
  locale = "ja",
}: {
  projectIdentifier: string;
  memberId: string;
  roles: Role[];
  selectedRoleIds: string[];
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(updateMemberRolesAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="memberId" value={memberId} />
      {roles.map((role) => (
        <label key={role.id} className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="roleIds" value={role.id} defaultChecked={selectedRoleIds.includes(role.id)} />
          {role.name}
        </label>
      ))}
      <button type="submit" disabled={pending} className="text-xs underline">
        {pending ? t("issue.saving") : t("issueForm.update")}
      </button>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600 basis-full">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
