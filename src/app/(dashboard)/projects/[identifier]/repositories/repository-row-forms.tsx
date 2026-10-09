"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { deleteRepositoryAction, updateRepositoryAction, type ScmActionState } from "@/interface/actions/scm-actions";

const initialState: ScmActionState = { error: null };

/**
 * Redmine's RepositoriesController#edit form, which exposes only what its `safe_attributes`
 * still accept on an existing record: the identifier (disabled once non-blank, mirroring
 * `identifier_frozen?`) and the default flag. The URL/path and the SCM vendor are create-only.
 */
export function UpdateRepositoryForm({
  projectIdentifier,
  scmRepositoryId,
  identifier,
  isDefault,
  locale = "ja",
}: {
  projectIdentifier: string;
  scmRepositoryId: string;
  identifier: string;
  isDefault: boolean;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(updateRepositoryAction, initialState);
  const identifierFrozen = identifier.length > 0;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="scmRepositoryId" value={scmRepositoryId} />
      <label className="sr-only" htmlFor={`identifier-${scmRepositoryId}`}>
        {translate(locale, "project.identifier")}
      </label>
      <input
        id={`identifier-${scmRepositoryId}`}
        name="identifier"
        defaultValue={identifier}
        disabled={identifierFrozen}
        pattern="[a-z0-9\-_]*"
        placeholder={t("repository.noIdentifier")}
        className="border rounded px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-500"
      />
      <label className="text-sm flex items-center gap-1">
        <input type="checkbox" name="isDefault" defaultChecked={isDefault} />
        {translate(locale, "repository.main")}
      </label>
      <button type="submit" disabled={pending} className="border rounded px-2 py-1 text-sm disabled:opacity-50">
        {translate(locale, "issueForm.update")}
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

export function DeleteRepositoryForm({ locale = "ja", projectIdentifier, scmRepositoryId }: { projectIdentifier: string; scmRepositoryId: string; locale?: Locale }) {
  const [state, formAction, pending] = useActionState(deleteRepositoryAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="scmRepositoryId" value={scmRepositoryId} />
      <button type="submit" disabled={pending} className="border rounded px-2 py-1 text-sm text-red-700 disabled:opacity-50">
        {translate(locale, "issue.delete")}
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
