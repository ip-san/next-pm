import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyTwofaPendingToken } from "@/infrastructure/auth/twofa-pending-token";
import { TWOFA_PENDING_COOKIE_NAME } from "@/interface/http/twofa-pending-cookie";
import { TwofaVerifyForm } from "./twofa-verify-form";

export default async function TwofaConfirmPage() {
  const cookieStore = await cookies();
  const pendingToken = cookieStore.get(TWOFA_PENDING_COOKIE_NAME)?.value;
  const pending = pendingToken ? await verifyTwofaPendingToken(pendingToken) : null;
  if (!pending) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col gap-6 items-center">
        <h1 className="text-2xl font-semibold">二段階認証</h1>
        <p className="text-sm text-gray-600 max-w-sm text-center">
          認証アプリに表示されている確認コード、またはバックアップコードのいずれかを入力してください。
        </p>
        <TwofaVerifyForm />
      </div>
    </main>
  );
}
