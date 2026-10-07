import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyTwofaPendingToken } from "@/infrastructure/auth/twofa-pending-token";
import { TWOFA_PENDING_COOKIE_NAME } from "@/interface/http/twofa-pending-cookie";
import { ForcedTwofaSetupForm } from "./forced-twofa-setup-form";

/**
 * Where loginAction sends a user whose account must carry a second factor (Setting.twofa '2'
 * or '3') but has none. No session exists yet — see confirmForcedTwofaPairingAction.
 */
export default async function ForcedTwofaSetupPage() {
  const cookieStore = await cookies();
  const pendingToken = cookieStore.get(TWOFA_PENDING_COOKIE_NAME)?.value;
  const pending = pendingToken ? await verifyTwofaPendingToken(pendingToken) : null;
  if (!pending) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col gap-6 items-center max-w-sm">
        <h1 className="text-2xl font-semibold">二段階認証の設定</h1>
        <p className="text-sm text-gray-600 text-center">
          このアカウントでは二段階認証が必須です。認証アプリを登録するとログインが完了します。
        </p>
        <ForcedTwofaSetupForm />
      </div>
    </main>
  );
}
