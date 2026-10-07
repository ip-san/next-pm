"use client";

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
export function AccessKeysSection({ hasApiKey, atomKey }: { hasApiKey: boolean; atomKey: string | null }) {
  const [showState, showAction, showPending] = useActionState(showApiKeyAction, keyInitial);
  const [resetState, resetAction, resetPending] = useActionState(resetApiKeyAction, keyInitial);
  const [atomState, atomAction, atomPending] = useActionState(resetAtomKeyAction, atomInitial);

  const visibleKey = resetState.apiKey ?? showState.apiKey;

  return (
    <section className="flex flex-col gap-3 border rounded p-4">
      <h2 className="font-medium">アクセスキー</h2>

      <div className="flex flex-col gap-2">
        <p className="text-sm">REST APIキー{hasApiKey || visibleKey ? "" : "（未発行）"}</p>
        {visibleKey ? <code className="text-sm bg-gray-50 rounded p-2 break-all">{visibleKey}</code> : null}
        <div className="flex gap-2">
          <form action={showAction}>
            <button type="submit" disabled={showPending} className="underline text-sm disabled:opacity-50">
              {showPending ? "表示中…" : "表示"}
            </button>
          </form>
          <form action={resetAction}>
            <button type="submit" disabled={resetPending} className="underline text-sm disabled:opacity-50">
              {resetPending ? "再生成中…" : "再生成"}
            </button>
          </form>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm">Atomフィードキー</p>
        {atomKey ? <code className="text-sm bg-gray-50 rounded p-2 break-all">{atomKey}</code> : <p className="text-xs text-gray-500">未発行（フィードを初めて開いたときに発行されます）</p>}
        <form action={atomAction}>
          <button type="submit" disabled={atomPending} className="underline text-sm disabled:opacity-50">
            {atomPending ? "再生成中…" : "再生成"}
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
