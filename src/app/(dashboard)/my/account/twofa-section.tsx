"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import {
  confirmTwofaPairingAction,
  deactivateTwofaAction,
  startTwofaPairingAction,
  type ConfirmTwofaPairingState,
  type DeactivateTwofaState,
  type StartTwofaPairingState,
} from "@/interface/actions/twofa-actions";

const startInitial: StartTwofaPairingState = { error: null, pairing: null };
const confirmInitial: ConfirmTwofaPairingState = { error: null, backupCodes: null };
const deactivateInitial: DeactivateTwofaState = { error: null, ok: false };

export function TwofaSection({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [startState, startAction, startPending] = useActionState(startTwofaPairingAction, startInitial);
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmTwofaPairingAction, confirmInitial);
  const [deactivateState, deactivateAction, deactivatePending] = useActionState(deactivateTwofaAction, deactivateInitial);

  // Server Actions revalidate the page's cache but don't push new props into this already-
  // mounted client component — refresh so `enabled` (and the account page's data) catch up.
  useEffect(() => {
    if (deactivateState.ok) {
      router.refresh();
    }
  }, [deactivateState.ok, router]);

  if (confirmState.backupCodes) {
    return (
      <section className="flex flex-col gap-3 border rounded p-4">
        <h2 className="font-medium">二段階認証を有効にしました</h2>
        <p className="text-sm text-gray-600">
          以下のバックアップコードは今だけ表示されます。認証アプリを利用できないときのために、安全な場所に保存してください。
        </p>
        <ul className="font-mono text-sm grid grid-cols-2 gap-1 bg-gray-50 rounded p-3">
          {confirmState.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <button type="button" onClick={() => router.refresh()} className="bg-black text-white rounded px-3 py-2 self-start text-sm">
          完了
        </button>
      </section>
    );
  }

  if (enabled) {
    return (
      <section className="flex flex-col gap-3 border rounded p-4">
        <h2 className="font-medium">二段階認証: 有効</h2>
        <form action={deactivateAction} className="flex flex-col gap-2">
          <label htmlFor="password" className="text-sm font-medium">
            現在のパスワード
          </label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="border rounded px-3 py-2" />
          {deactivateState.error ? (
            <p role="alert" className="text-sm text-red-600">
              {deactivateState.error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={deactivatePending}
            className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start text-sm"
          >
            {deactivatePending ? "無効化中…" : "二段階認証を無効にする"}
          </button>
        </form>
      </section>
    );
  }

  if (startState.pairing) {
    return (
      <section className="flex flex-col gap-3 border rounded p-4">
        <h2 className="font-medium">認証アプリを設定</h2>
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
            {confirmPending ? "確認中…" : "有効にする"}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 border rounded p-4">
      <h2 className="font-medium">二段階認証: 無効</h2>
      <form action={startAction} className="flex flex-col gap-2 items-start">
        {startState.error ? (
          <p role="alert" className="text-sm text-red-600">
            {startState.error}
          </p>
        ) : null}
        <button type="submit" disabled={startPending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 text-sm">
          {startPending ? "準備中…" : "二段階認証を設定する"}
        </button>
      </form>
    </section>
  );
}
