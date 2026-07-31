import type { Enumeration, EnumerationType } from "./entity";

export interface EnumerationRepository {
  listByType(type: EnumerationType): Promise<Enumeration[]>;
  create(enumeration: Omit<Enumeration, "id">): Promise<Enumeration>;
  /** Mirrors Enumeration#check_default — clears the system-wide default flag for `type` so a new default stays unique. */
  unsetSystemDefaultsForType(type: EnumerationType): Promise<void>;
}
