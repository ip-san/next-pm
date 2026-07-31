import type { Tracker } from "./entity";

export interface TrackerRepository {
  findById(id: string): Promise<Tracker | null>;
  findByIds(ids: string[]): Promise<Tracker[]>;
  listAll(): Promise<Tracker[]>;
  create(tracker: Omit<Tracker, "id">): Promise<Tracker>;
}
