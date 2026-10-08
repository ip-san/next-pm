export interface Board {
  id: string;
  projectId: string;
  /** Null for a top-level board. Redmine's `acts_as_tree` parent within the same project. */
  parentId: string | null;
  name: string;
  description: string;
  /** 1-based, dense within the (project, parent) sibling set. */
  position: number;
}
