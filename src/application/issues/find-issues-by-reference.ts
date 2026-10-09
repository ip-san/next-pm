import type { Issue } from "@/domain/issue/entity";
import type { IssueRepository } from "@/domain/issue/repository";

/**
 * The issues a written reference names: `123` is the issue number users see (`#123`), and anything else is the
 * first eight characters of the uuid (the older `#eb0b2d1a` shorthand, which mail subjects and commit messages
 * sent before numbers existed still carry). Returns every match, so a caller can reject an ambiguous prefix.
 */
export async function findIssuesByReference(
  repository: Pick<IssueRepository, "findByNumber" | "findByIdPrefix">,
  reference: string,
): Promise<Issue[]> {
  if (/^[1-9]\d*$/.test(reference)) {
    const issue = await repository.findByNumber(Number(reference));
    return issue ? [issue] : [];
  }
  return repository.findByIdPrefix(reference);
}
