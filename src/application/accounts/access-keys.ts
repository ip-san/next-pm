import type { UserRepository } from "@/domain/user/repository";
import { generateToken } from "@/domain/user/token";

/**
 * Mirrors Redmine's MyController#show_api_key / #reset_api_key / #reset_atom_key.
 *
 * Until now next-pm could *authenticate* with an API key (currentUserFromAuthorizationHeader)
 * but had no way to ever issue one — users.api_key was written by nothing, so the whole REST
 * API was unreachable for anyone who didn't edit the database by hand. Redmine's User#api_key
 * is likewise lazy: the key comes into existence the first time it is asked for.
 *
 * Resetting means replacing, not clearing: Redmine destroys the old token and immediately
 * calls api_key again, so the user always leaves the page holding a usable key.
 */
export async function showOrCreateApiKey(userRepository: UserRepository, userId: string): Promise<string | null> {
  const user = await userRepository.findById(userId);
  if (!user) return null;
  if (user.apiKey) return user.apiKey;

  const apiKey = generateToken();
  await userRepository.setApiKey(userId, apiKey);
  return apiKey;
}

export async function resetApiKey(userRepository: UserRepository, userId: string): Promise<string> {
  const apiKey = generateToken();
  await userRepository.setApiKey(userId, apiKey);
  return apiKey;
}

export async function resetAtomKey(userRepository: UserRepository, userId: string): Promise<string> {
  const atomKey = generateToken();
  await userRepository.setAtomKey(userId, atomKey);
  return atomKey;
}
