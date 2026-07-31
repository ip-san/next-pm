import type { IssueRelation } from "./entity";

export interface IssueRelationRepository {
  listForIssue(issueId: string): Promise<IssueRelation[]>;
  create(relation: Omit<IssueRelation, "id">): Promise<IssueRelation>;
}
