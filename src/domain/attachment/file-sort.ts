import type { Attachment } from "./entity";

/** Columns FilesController#index exposes to sort_update, in the order its table shows them. */
export const FILE_SORT_COLUMNS = ["filename", "created_on", "size", "downloads"] as const;
export type FileSortColumn = (typeof FILE_SORT_COLUMNS)[number];
export type SortOrder = "asc" | "desc";

export interface FileSort {
  column: FileSortColumn;
  order: SortOrder;
}

/** FilesController#index's `sort_init 'filename', 'asc'`. */
export const DEFAULT_FILE_SORT: FileSort = { column: "filename", order: "asc" };

export function parseFileSort(column: string | undefined, order: string | undefined): FileSort {
  return {
    column: (FILE_SORT_COLUMNS as readonly string[]).includes(column ?? "") ? (column as FileSortColumn) : DEFAULT_FILE_SORT.column,
    order: order === "desc" || order === "asc" ? order : DEFAULT_FILE_SORT.order,
  };
}

/**
 * Redmine's sort links flip to the column's `default_order` on first click: ascending for the
 * filename, descending for date/size/downloads (the "most recent / biggest / most popular
 * first" reading people expect).
 */
export function defaultOrderFor(column: FileSortColumn): SortOrder {
  return column === "filename" ? "asc" : "desc";
}

/** Next order for a sort header link: same column toggles, a new column starts at its default. */
export function nextSortFor(current: FileSort, column: FileSortColumn): FileSort {
  if (current.column !== column) {
    return { column, order: defaultOrderFor(column) };
  }
  return { column, order: current.order === "asc" ? "desc" : "asc" };
}

function compareBy(column: FileSortColumn, a: Attachment, b: Attachment): number {
  switch (column) {
    case "filename":
      return a.filename.localeCompare(b.filename);
    case "created_on":
      return a.createdAt.getTime() - b.createdAt.getTime();
    case "size":
      return a.fileSize - b.fileSize;
    case "downloads":
      return a.downloads - b.downloads;
  }
}

/** Sorts one container's files; ties fall back to the filename so the order is stable. */
export function sortAttachments(attachments: Attachment[], sort: FileSort): Attachment[] {
  const direction = sort.order === "desc" ? -1 : 1;
  return [...attachments].sort((a, b) => {
    const primary = compareBy(sort.column, a, b);
    return primary !== 0 ? primary * direction : a.filename.localeCompare(b.filename);
  });
}
