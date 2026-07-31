export interface TimeEntry {
  id: string;
  projectId: string;
  issueId: string | null;
  userId: string;
  authorId: string;
  activityId: string;
  hours: number;
  comments: string;
  spentOn: string;
  createdAt: Date;
}
