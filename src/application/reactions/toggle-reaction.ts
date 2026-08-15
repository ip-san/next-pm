import type { ReactableType } from "@/domain/reaction/entity";
import type { ReactionRepository } from "@/domain/reaction/repository";

/**
 * Self-reaction add/remove — mirrors toggleWatch's own reasoning: a user reacting to something
 * they can already view needs no separate permission, since it's their own reaction being
 * toggled, not another user's.
 */
export async function toggleReaction(
  repositories: { reactionRepository: ReactionRepository },
  reactableType: ReactableType,
  reactableId: string,
  userId: string,
): Promise<{ reacted: boolean }> {
  const hasReacted = await repositories.reactionRepository.hasReacted(reactableType, reactableId, userId);
  if (hasReacted) {
    await repositories.reactionRepository.unreact(reactableType, reactableId, userId);
    return { reacted: false };
  }
  await repositories.reactionRepository.react(reactableType, reactableId, userId);
  return { reacted: true };
}
