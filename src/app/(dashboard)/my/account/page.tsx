import { redirect } from "next/navigation";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { PasswordSection } from "./password-section";
import { TwofaSection } from "./twofa-section";

export default async function MyAccountPage() {
  const user = await currentUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="p-8 flex flex-col gap-6 max-w-lg">
      <h1 className="text-xl font-semibold">アカウント設定</h1>
      <PasswordSection authSource={user.authSource} />
      <TwofaSection enabled={user.twofaScheme !== null} />
    </main>
  );
}
