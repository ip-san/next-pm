import { cookies } from "next/headers";
import { currentLocale } from "@/interface/http/locale";
import { translate } from "@/domain/i18n/messages";
import { redirect } from "next/navigation";
import { verifyTwofaPendingToken } from "@/infrastructure/auth/twofa-pending-token";
import { TWOFA_PENDING_COOKIE_NAME } from "@/interface/http/twofa-pending-cookie";
import { ForcedTwofaSetupForm } from "./forced-twofa-setup-form";

/**
 * Where loginAction sends a user whose account must carry a second factor (Setting.twofa '2'
 * or '3') but has none. No session exists yet — see confirmForcedTwofaPairingAction.
 */
export default async function ForcedTwofaSetupPage() {
  const locale = await currentLocale();
  const cookieStore = await cookies();
  const pendingToken = cookieStore.get(TWOFA_PENDING_COOKIE_NAME)?.value;
  const pending = pendingToken ? await verifyTwofaPendingToken(pendingToken) : null;
  if (!pending) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col gap-6 items-center max-w-sm">
        <h1 className="text-2xl font-semibold">{translate(locale, "auth.twofaSetupTitle")}</h1>
        <p className="text-sm text-gray-600 text-center">
          {translate(locale, "auth.twofaRequired")}
        </p>
        <ForcedTwofaSetupForm locale={locale} />
      </div>
    </main>
  );
}
