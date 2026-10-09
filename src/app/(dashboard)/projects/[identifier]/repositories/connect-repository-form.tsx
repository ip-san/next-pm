"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState, useState } from "react";
import { connectRepositoryAction, type ScmActionState } from "@/interface/actions/scm-actions";

const initialState: ScmActionState = { error: null };

const VENDOR_LABEL = { git: "Git", subversion: "Subversion", mercurial: "Mercurial" } as const;
const VENDOR_HINT: Record<"git" | "mercurial" | "subversion", { labelKey: MessageKey; placeholder: string }> = {
  git: { labelKey: "repository.pathLabel", placeholder: "/var/repos/example.git" },
  mercurial: { labelKey: "repository.pathLabel", placeholder: "/var/repos/example-hg" },
  subversion: { labelKey: "repository.urlLabel", placeholder: "file:///var/svn/example" },
} as const;

/**
 * Redmine's RepositoriesController#new form. `isFirst` mirrors its
 * `@repository.is_default = @project.repository.nil?` — the project's first repository is
 * forced to be the default anyway (`set_as_default?`), so the checkbox is pre-ticked and
 * disabled rather than offering a choice that would be overridden.
 */
export function ConnectRepositoryForm({ locale = "ja", projectIdentifier, isFirst }: { projectIdentifier: string; isFirst: boolean; locale?: Locale }) {
  const [state, formAction, pending] = useActionState(connectRepositoryAction, initialState);
  const [vendor, setVendor] = useState<keyof typeof VENDOR_HINT>("git");
  const hint = VENDOR_HINT[vendor];

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-md border rounded p-4">
      <h2 className="font-medium text-sm">{translate(locale, "repository.add")}</h2>
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <label htmlFor="vendor" className="text-sm font-medium">
        {translate(locale, "repository.type")}
      </label>
      <select
        id="vendor"
        name="vendor"
        value={vendor}
        onChange={(e) => setVendor(e.target.value as keyof typeof VENDOR_HINT)}
        className="border rounded px-3 py-2 text-sm"
      >
        {Object.entries(VENDOR_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <label htmlFor="identifier" className="text-sm font-medium">
        {translate(locale, "project.identifier")}
      </label>
      <input
        id="identifier"
        name="identifier"
        placeholder="docs"
        pattern="[a-z0-9\-_]*"
        className="border rounded px-3 py-2 text-sm"
        aria-describedby="identifier-hint"
      />
      <p id="identifier-hint" className="text-xs text-gray-500">
        {translate(locale, "repository.identifierHelp")}
      </p>
      <label htmlFor="rootPath" className="text-sm font-medium">
        {translate(locale, hint.labelKey)}
      </label>
      <input id="rootPath" name="rootPath" placeholder={hint.placeholder} required className="border rounded px-3 py-2 text-sm" />
      <label className="text-sm flex items-center gap-2">
        <input type="checkbox" name="isDefault" defaultChecked={isFirst} disabled={isFirst} />
        {translate(locale, "repository.makeMain")}
      </label>
      {isFirst ? <p className="text-xs text-gray-500">{translate(locale, "repository.firstIsMain")}</p> : null}
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        {translate(locale, "repository.connect")}
      </button>
    </form>
  );
}
