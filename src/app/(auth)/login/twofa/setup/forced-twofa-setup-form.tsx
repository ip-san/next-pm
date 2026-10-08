"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  confirmForcedTwofaPairingAction,
  startForcedTwofaPairingAction,
  type ConfirmTwofaPairingState,
  type StartTwofaPairingState,
} from "@/interface/actions/twofa-actions";

const startInitial: StartTwofaPairingState = { error: null, pairing: null };
const confirmInitial: ConfirmTwofaPairingState = { error: null, backupCodes: null };

export function ForcedTwofaSetupForm() {
  const [startState, startAction, startPending] = useActionState(startForcedTwofaPairingAction, startInitial);
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmForcedTwofaPairingAction, confirmInitial);

  // The session was established by the confirm action, so this is the logged-in state already.
  if (confirmState.backupCodes) {
    return (
      <section className="flex flex-col gap-3 w-full">
        <h2 className="font-medium">二段階認証を有効にしました</h2>
        <p className="text-sm text-gray-600">
          以下のバックアップコードは今だけ表示されます。認証アプリを利用できないときのために、安全な場所に保存してください。
        </p>
        <ul className="font-mono text-sm grid grid-cols-2 gap-1 bg-gray-50 rounded p-3">
          {confirmState.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <Link href="/" className="bg-black text-white rounded px-3 py-2 self-start text-sm">
          次へ進む
        </Link>
      </section>
    );
  }

  if (startState.pairing) {
    return (
      <section className="flex flex-col gap-3 w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, next/image can't optimize it anyway */}
        <img src={startState.pairing.qrDataUrl} alt="QRコード" width={200} height={200} />
        <p className="text-sm text-gray-600">QRコードを読み取るか、以下のキーを認証アプリに手動で入力してください:</p>
        <code className="text-sm bg-gray-50 rounded p-2 break-all">
          {startState.pairing.secretBase32.match(/.{1,4}/g)?.join(" ") ?? startState.pairing.secretBase32}
        </code>
        <form action={confirmAction} className="flex flex-col gap-2">
          <label htmlFor="code" className="text-sm font-medium">
            確認コード
          </label>
          <input id="code" name="code" autoComplete="one-time-code" required className="border rounded px-3 py-2" />
          {confirmState.error ? (
            <p role="alert" className="text-sm text-red-600">
              {confirmState.error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={confirmPending}
            className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start text-sm"
          >
            {confirmPending ? "確認中…" : "有効にしてログイン"}
          </button>
        </form>
      </section>
    );
  }

  return (
    <form action={startAction} className="flex flex-col gap-2 items-start w-full">
      {startState.error ? (
        <p role="alert" className="text-sm text-red-600">
          {startState.error}
        </p>
      ) : null}
      <button type="submit" disabled={startPending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 text-sm">
        {startPending ? "準備中…" : "認証アプリを登録する"}
      </button>
    </form>
  );
}
