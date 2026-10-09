"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import {
  resetApiKeyAction,
  resetAtomKeyAction,
  showApiKeyAction,
  type AccessKeyActionState,
  type EmailAddressActionState,
} from "@/interface/actions/my-account-actions";

const keyInitial: AccessKeyActionState = { error: null, apiKey: null };
const atomInitial: EmailAddressActionState = { error: null };

/**
 * Redmine's MyController#show_api_key / #reset_api_key / #reset_atom_key, which are three
 * separate actions behind "show" and "reset" buttons rather than a key printed on the page.
 * Keeping that shape matters: the account page is the kind of screen people leave open and
 * screen-share, and the API key is a password-equivalent credential.
 */
export function AccessKeysSection({ locale = "ja", hasApiKey, atomKey }: { hasApiKey: boolean; atomKey: string | null; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [showState, showAction, showPending] = useActionState(showApiKeyAction, keyInitial);
  const [resetState, resetAction, resetPending] = useActionState(resetApiKeyAction, keyInitial);
  const [atomState, atomAction, atomPending] = useActionState(resetAtomKeyAction, atomInitial);

  const visibleKey = resetState.apiKey ?? showState.apiKey;

  return (
    <section className="flex flex-col gap-3 border rounded p-4">
      <h2 className="font-medium">{translate(locale, "account.accessKeys")}</h2>

      <div className="flex flex-col gap-2">
        <p className="text-sm">{t("account.restKey")}{hasApiKey || visibleKey ? "" : t("account.notIssued")}</p>
        {visibleKey ? <code className="text-sm bg-gray-50 rounded p-2 break-all">{visibleKey}</code> : null}
        <div className="flex gap-2">
          <form action={showAction}>
            <button type="submit" disabled={showPending} className="underline text-sm disabled:opacity-50">
              {showPending ? t("account.showing") : t("account.show")}
            </button>
          </form>
          <form action={resetAction}>
            <button type="submit" disabled={resetPending} className="underline text-sm disabled:opacity-50">
              {resetPending ? t("account.regenerating") : t("account.regenerate")}
            </button>
          </form>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm">{t("account.atomKey")}</p>
        {atomKey ? <code className="text-sm bg-gray-50 rounded p-2 break-all">{atomKey}</code> : <p className="text-xs text-gray-500">{t("account.atomNotIssued")}</p>}
        <form action={atomAction}>
          <button type="submit" disabled={atomPending} className="underline text-sm disabled:opacity-50">
            {atomPending ? t("account.regenerating") : t("account.regenerate")}
          </button>
        </form>
      </div>

      {[showState.error, resetState.error, atomState.error].filter(Boolean).map((error) => (
        <p key={error} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ))}
    </section>
  );
}
