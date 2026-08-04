import { redirect } from "next/navigation";
import { logoutAction } from "@/interface/actions/auth-actions";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { TwofaSection } from "./twofa-section";

export default async function MyAccountPage() {
  const user = await currentUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="p-8 flex flex-col gap-6 max-w-lg">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">アカウント設定</h1>
        <form action={logoutAction}>
          <button type="submit" className="text-sm underline">
            ログアウト
          </button>
        </form>
      </div>
      <TwofaSection enabled={user.twofaScheme !== null} />
    </main>
  );
}
