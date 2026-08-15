/** Only Journal is reactable for now — mirrors Redmine's own reactions, which today only render on journal entries. */
export type ReactableType = "Journal";

export interface Reaction {
  id: string;
  reactableType: ReactableType;
  reactableId: string;
  userId: string;
  createdAt: Date;
}
