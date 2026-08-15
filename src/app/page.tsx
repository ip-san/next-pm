import { redirect } from "next/navigation";
import { currentUserFromCookies } from "@/interface/http/current-user";

export default async function Home() {
  const user = await currentUserFromCookies();
  redirect(user ? "/my" : "/login");
}
