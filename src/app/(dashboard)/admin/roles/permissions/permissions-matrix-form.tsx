"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { Fragment, useActionState } from "react";
import { updateRolePermissionsAction } from "@/interface/actions/admin-role-actions";
import type { AdminActionState } from "@/interface/actions/admin-action-state";
import type { Role } from "@/domain/role/entity";
import { isMemberRole, setablePermissions } from "@/domain/role/entity";
import { MODULE_LABEL_KEY, PERMISSION_LABEL_KEY, PERMISSIONS_BY_MODULE } from "../permission-labels";

const initialState: AdminActionState = { error: null };

/**
 * All roles × all permissions in one grid, mirroring Redmine's roles/permissions tab — the
 * only place any role's (including builtin Anonymous/Non-member) permission set can be edited
 * in bulk, rather than one role at a time via the create form.
 */
export function PermissionsMatrixForm({ locale = "ja", roles }: { roles: Role[]; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(updateRolePermissionsAction, initialState);
  const permissionsByRole = new Map(roles.map((role) => [role.id, new Set(role.permissions)]));
  // Redmine's roles/permissions view renders a cell only where Role#setable_permissions allows
  // it, leaving the builtin columns blank for permissions those roles can never hold.
  const setableByRole = new Map(roles.map((role) => [role.id, new Set(setablePermissions(role.builtin))]));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {roles.map((role) => (
        <input key={role.id} type="hidden" name="roleIds" value={role.id} />
      ))}

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse">
          <thead>
            <tr>
              <th className="border px-2 py-1 bg-gray-50 text-left">{t("admin.roles.matrixHeader")}</th>
              {roles.map((role) => (
                <th key={role.id} className="border px-2 py-1 bg-gray-50 whitespace-nowrap">
                  {isMemberRole(role) ? role.name : <em>{role.name}</em>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(PERMISSIONS_BY_MODULE).map(([moduleKey, permissions]) => (
              <Fragment key={moduleKey}>
                <tr>
                  <td colSpan={roles.length + 1} className="border px-2 py-1 bg-gray-100 font-medium text-xs">
                    {translate(locale, MODULE_LABEL_KEY[moduleKey])}
                  </td>
                </tr>
                {permissions.map((permission) => (
                  <tr key={permission}>
                    <th className="border px-2 py-1 text-left whitespace-nowrap font-normal">{translate(locale, PERMISSION_LABEL_KEY[permission])}</th>
                    {roles.map((role) => (
                      <td key={role.id} className="border px-2 py-1 text-center">
                        {setableByRole.get(role.id)?.has(permission) ? (
                          <input
                            type="checkbox"
                            name={`permissions:${role.id}`}
                            value={permission}
                            defaultChecked={permissionsByRole.get(role.id)?.has(permission) ?? false}
                          />
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start"
      >
        {pending ? t("issue.saving") : t("issue.save")}
      </button>
    </form>
  );
}
