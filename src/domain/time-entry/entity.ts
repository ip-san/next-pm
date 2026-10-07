export interface TimeEntry {
  id: string;
  projectId: string;
  issueId: string | null;
  /** The person the time is attributed to; differs from authorId when logged via log_time_for_other_users. */
  userId: string;
  authorId: string;
  activityId: string;
  hours: number;
  comments: string;
  spentOn: string;
  createdAt: Date;
  updatedAt: Date;
}
