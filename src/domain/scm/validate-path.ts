export class InvalidRepositoryPathError extends Error {}
export class InvalidRefError extends Error {}

/**
 * Rejects `..` segments and absolute paths so a browsed path can never be steered outside the
 * repository root — defense in depth on top of git's own path scoping (git ls-tree/show resolve
 * paths relative to the repo root and never escape it, but we don't rely on that alone).
 */
export function validateRepositoryPath(path: string): void {
  if (path.startsWith("/")) {
    throw new InvalidRepositoryPathError("パスは相対パスで指定してください。");
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new InvalidRepositoryPathError("不正なパスです。");
  }
}

/**
 * Even with argv-array execFile (no shell involved), a value starting with `-` is still parsed
 * by git itself as an option rather than a ref/pathspec — this is argument injection, a distinct
 * risk from shell injection. Reject it outright rather than trying to escape it.
 */
export function validateRef(ref: string): void {
  if (ref.length === 0 || ref.startsWith("-")) {
    throw new InvalidRefError("不正なリビジョンです。");
  }
}
