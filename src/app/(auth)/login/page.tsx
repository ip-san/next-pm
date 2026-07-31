import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col gap-6 items-center">
        <h1 className="text-2xl font-semibold">next-pm にログイン</h1>
        <LoginForm />
      </div>
    </main>
  );
}
