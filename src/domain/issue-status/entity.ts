export interface IssueStatus {
  id: string;
  name: string;
  description: string;
  isClosed: boolean;
  defaultDoneRatio: number | null;
  position: number;
}
