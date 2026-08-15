import type { Reaction, ReactableType } from "./entity";

export interface ReactionRepository {
  hasReacted(reactableType: ReactableType, reactableId: string, userId: string): Promise<boolean>;
  react(reactableType: ReactableType, reactableId: string, userId: string): Promise<void>;
  unreact(reactableType: ReactableType, reactableId: string, userId: string): Promise<void>;
  /** Every reaction across the given reactables in one query — avoids N+1 when rendering a list (e.g. a journal timeline). */
  listForReactables(reactableType: ReactableType, reactableIds: string[]): Promise<Reaction[]>;
}
