import { cookies } from "next/headers";
import { currentLocale } from "@/interface/http/locale";
import { translate } from "@/domain/i18n/messages";
import { redirect } from "next/navigation";
import { verifyTwofaPendingToken } from "@/infrastructure/auth/twofa-pending-token";
import { TWOFA_PENDING_COOKIE_NAME } from "@/interface/http/twofa-pending-cookie";
import { TwofaVerifyForm } from "./twofa-verify-form";

export default async function TwofaConfirmPage() {
  const locale = await currentLocale();
  const cookieStore = await cookies();
  const pendingToken = cookieStore.get(TWOFA_PENDING_COOKIE_NAME)?.value;
  const pending = pendingToken ? await verifyTwofaPendingToken(pendingToken) : null;
  if (!pending) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col gap-6 items-center">
        <h1 className="text-2xl font-semibold">{translate(locale, "auth.twofaTitle")}</h1>
        <p className="text-sm text-gray-600 max-w-sm text-center">
          {translate(locale, "auth.twofaHelp")}
        </p>
        <TwofaVerifyForm locale={locale} />
      </div>
    </main>
  );
}
