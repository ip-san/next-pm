import type { IssueRelation } from "./entity";

export interface IssueRelationRepository {
  listForIssue(issueId: string): Promise<IssueRelation[]>;
  findById(id: string): Promise<IssueRelation | null>;
  create(relation: Omit<IssueRelation, "id">): Promise<IssueRelation>;
  delete(id: string): Promise<void>;
}
