import { resolveMyPagePreferences } from "@/domain/my-page/resolve";
import type { MyPagePreferences, MyPageRepository } from "@/domain/my-page/repository";

export async function loadMyPagePreferences(myPageRepository: MyPageRepository, userId: string): Promise<MyPagePreferences> {
  const stored = await myPageRepository.find(userId);
  return resolveMyPagePreferences(stored);
}
