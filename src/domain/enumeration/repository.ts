import type { Enumeration, EnumerationType } from "./entity";

export interface EnumerationRepository {
  listByType(type: EnumerationType): Promise<Enumeration[]>;
  create(enumeration: Omit<Enumeration, "id">): Promise<Enumeration>;
}
