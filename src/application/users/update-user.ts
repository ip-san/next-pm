import { generateSalt, hashPassword } from "@/domain/user/password";
import type { UserAdminRepository, UserRepository } from "@/domain/user/repository";

/** A refusal the caller can show as-is: the admin form and the REST API both print the message. */
export class UserUpdateError extends Error {}

export interface UpdateUserInput {
  userId: string;
  login: string;
  mail: string;
  firstname: string;
  lastname: string;
  /** The requested admin flag. The acting user's own flag is never changed here. */
  isAdmin: boolean;
  /** null: internal authentication; "ldap": delegated to a directory. */
  authSource: "ldap" | null;
  /** Empty leaves the password alone (UsersController#update only sets one when it was submitted). */
  password: string;
}

/**
 * Redmine's UsersController#update, shared by the admin form and the REST API. Every rule is
 * settled before anything is written, so a refused password can't leave the attributes half-saved.
 */
export async function updateUser(
  repositories: { userRepository: UserRepository; userAdminRepository: UserAdminRepository },
  input: UpdateUserInput,
  actingUserId: string | null,
): Promise<void> {
  const { userRepository, userAdminRepository } = repositories;
  const existing = await userRepository.findById(input.userId);
  if (!existing || existing.status === "anonymous") {
    throw new UserUpdateError("ユーザーが見つかりません。");
  }

  const byLogin = await userRepository.findByLogin(input.login);
  if (byLogin && byLogin.id !== existing.id) {
    throw new UserUpdateError("そのログインIDは既に使用されています。");
  }

  const password = input.password;
  if (password.length > 0) {
    if (input.authSource === "ldap") {
      throw new UserUpdateError("LDAP認証のユーザーにはパスワードを設定できません。");
    }
    if (password.length < 8) {
      throw new UserUpdateError("パスワードは8文字以上で入力してください。");
    }
  } else if (existing.authSource === "ldap" && input.authSource === null) {
    // An LDAP-backed account carries an empty local hash by construction (see schema/users.ts),
    // so moving it to internal authentication without a password would lock it out for good.
    throw new UserUpdateError("内部認証に切り替えるにはパスワードを設定してください。");
  }

  // Redmine's users/_form hides the admin checkbox for User.current, so nobody can demote
  // themselves and lock the instance out of its own admin area.
  const isAdmin = actingUserId !== null && actingUserId === existing.id ? existing.isAdmin : input.isAdmin;

  try {
    await userAdminRepository.update(existing.id, {
      login: input.login,
      mail: input.mail,
      firstname: input.firstname,
      lastname: input.lastname,
      isAdmin,
      authSource: input.authSource,
    });
  } catch (error) {
    if (duplicateMailError(error)) {
      throw new UserUpdateError("そのメールアドレスは既に使用されています。");
    }
    throw error;
  }

  if (password.length > 0) {
    const salt = generateSalt();
    await userRepository.updatePassword(existing.id, hashPassword(password, salt), salt);
  }
}

/**
 * The mail column carries a unique constraint checked only at write time; drizzle-orm wraps the
 * raw pg driver error in `.cause` rather than surfacing its code directly, so unwrap to detect it.
 */
function duplicateMailError(error: unknown): boolean {
  const pgError = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  return pgError instanceof Error && "code" in pgError && pgError.code === "23505";
}
