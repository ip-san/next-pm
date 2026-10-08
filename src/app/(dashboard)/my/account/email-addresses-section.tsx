"use client";

import { useActionState } from "react";
import {
  addEmailAddressAction,
  removeEmailAddressAction,
  setEmailAddressNotifyAction,
  type EmailAddressActionState,
} from "@/interface/actions/my-account-actions";

const initialState: EmailAddressActionState = { error: null };

export interface AdditionalAddress {
  id: string;
  address: string;
  notify: boolean;
}

/** Redmine's EmailAddressesController#index, rendered inline on the account page. */
export function EmailAddressesSection({
  defaultMail,
  addresses,
  maxAdditionalEmails,
}: {
  defaultMail: string;
  addresses: AdditionalAddress[];
  maxAdditionalEmails: number;
}) {
  const [addState, addAction, addPending] = useActionState(addEmailAddressAction, initialState);
  const [removeState, removeAction] = useActionState(removeEmailAddressAction, initialState);
  const [notifyState, notifyAction] = useActionState(setEmailAddressNotifyAction, initialState);

  const atLimit = addresses.length >= maxAdditionalEmails;

  return (
    <section className="flex flex-col gap-3 border rounded p-4">
      <h2 className="font-medium">メールアドレス</h2>
      <ul className="text-sm flex flex-col gap-2">
        <li className="flex items-center gap-3">
          <span>{defaultMail}</span>
          <span className="text-xs text-gray-500">(主アドレス)</span>
        </li>
        {addresses.map((address) => (
          <li key={address.id} className="flex items-center gap-3">
            <span>{address.address}</span>
            <form action={notifyAction} className="flex items-center gap-1">
              <input type="hidden" name="addressId" value={address.id} />
              <input type="hidden" name="notify" value={address.notify ? "0" : "1"} />
              <button type="submit" className="underline text-xs">
                {address.notify ? "通知する" : "通知しない"}
              </button>
            </form>
            <form action={removeAction}>
              <input type="hidden" name="addressId" value={address.id} />
              <button type="submit" className="underline text-xs text-red-600">
                削除
              </button>
            </form>
          </li>
        ))}
      </ul>

      {atLimit ? (
        <p className="text-xs text-gray-500">追加できるメールアドレスは{maxAdditionalEmails}件までです。</p>
      ) : (
        <form action={addAction} className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm flex-1">
            メールアドレスを追加
            <input name="address" type="email" required className="border rounded px-2 py-1" />
          </label>
          <button type="submit" disabled={addPending} className="bg-black text-white rounded px-3 py-1 disabled:opacity-50 text-sm">
            {addPending ? "追加中…" : "追加"}
          </button>
        </form>
      )}

      {[addState.error, removeState.error, notifyState.error].filter(Boolean).map((error) => (
        <p key={error} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ))}
    </section>
  );
}
