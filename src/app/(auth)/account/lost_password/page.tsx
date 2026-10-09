import { LostPasswordRequestForm } from "./lost-password-request-form";
import { currentLocale } from "@/interface/http/locale";
import { translate } from "@/domain/i18n/messages";
import { ResetPasswordForm } from "./reset-password-form";

export default async function LostPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const locale = await currentLocale();
  const { token } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col gap-6 items-center">
        <h1 className="text-2xl font-semibold">{translate(locale, "auth.lostPasswordTitle")}</h1>
        {token ? <ResetPasswordForm locale={locale} token={token} /> : <LostPasswordRequestForm locale={locale} />}
      </div>
    </main>
  );
}
