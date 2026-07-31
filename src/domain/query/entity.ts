import type { FilterCondition } from "./filter-builder";

export type QueryVisibility = "private" | "roles" | "public";

export interface SavedQuery {
  id: string;
  name: string;
  projectId: string | null;
  userId: string;
  visibility: QueryVisibility;
  filters: FilterCondition[];
}
