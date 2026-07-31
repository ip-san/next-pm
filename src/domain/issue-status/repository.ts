import type { IssueStatus } from "./entity";

export interface IssueStatusRepository {
  findById(id: string): Promise<IssueStatus | null>;
  listAll(): Promise<IssueStatus[]>;
  create(status: Omit<IssueStatus, "id">): Promise<IssueStatus>;
}
