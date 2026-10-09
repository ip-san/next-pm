"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { deleteVersionAction, type VersionActionState } from "@/interface/actions/version-actions";

const initialState: VersionActionState = { error: null };

export function DeleteVersionButton({ locale = "ja", projectIdentifier, versionId }: { projectIdentifier: string; versionId: string; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(deleteVersionAction, initialState);

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="versionId" value={versionId} />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="text-xs underline text-red-600">
        {t("issue.delete")}
      </button>
    </form>
  );
}
