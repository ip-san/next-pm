import { LostPasswordRequestForm } from "./lost-password-request-form";
import { ResetPasswordForm } from "./reset-password-form";

export default async function LostPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col gap-6 items-center">
        <h1 className="text-2xl font-semibold">パスワードの再設定</h1>
        {token ? <ResetPasswordForm token={token} /> : <LostPasswordRequestForm />}
      </div>
    </main>
  );
}
