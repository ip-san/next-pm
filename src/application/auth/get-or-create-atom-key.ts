import { generateToken } from "@/domain/user/token";
import type { UserRepository } from "@/domain/user/repository";

/**
 * Mirrors Redmine's User#atom_key: lazily assigns a feed token the first time it's needed
 * (embedding an atom link on a page the user is viewing), rather than requiring an explicit
 * "generate my feed key" step before the link even works.
 */
export async function getOrCreateAtomKey(userRepository: UserRepository, userId: string): Promise<string | null> {
  const user = await userRepository.findById(userId);
  if (!user) return null;
  if (user.atomKey) return user.atomKey;

  const atomKey = generateToken();
  await userRepository.setAtomKey(userId, atomKey);
  return atomKey;
}
