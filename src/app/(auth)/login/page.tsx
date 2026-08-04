import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col gap-6 items-center">
        <h1 className="text-2xl font-semibold">next-pm にログイン</h1>
        {error === "twofa_too_many_tries" ? (
          <p role="alert" className="text-sm text-red-600">
            確認コードの試行回数が上限に達しました。もう一度ログインしてください。
          </p>
        ) : null}
        <LoginForm />
      </div>
    </main>
  );
}
