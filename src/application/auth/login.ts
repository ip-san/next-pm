import { isActiveUser } from "@/domain/user/entity";
import { verifyPassword } from "@/domain/user/password";
import type { UserRepository } from "@/domain/user/repository";
import type { User } from "@/domain/user/entity";

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; reason: "invalid_credentials" | "account_not_active" };

export async function login(
  userRepository: UserRepository,
  login: string,
  clearPassword: string,
): Promise<LoginResult> {
  const user = await userRepository.findByLogin(login);
  if (!user || !verifyPassword(clearPassword, user.passwordSalt, user.passwordHash)) {
    return { ok: false, reason: "invalid_credentials" };
  }
  if (!isActiveUser(user)) {
    return { ok: false, reason: "account_not_active" };
  }
  return { ok: true, user };
}
