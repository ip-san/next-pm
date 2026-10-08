import type { CustomFieldViewer } from "@/domain/custom-field/visibility";
import type { User } from "@/domain/user/entity";

/**
 * The viewer for custom field visibility on a project: admins see everything, anyone else through the roles
 * they hold in that project (the same `roleIds` resolveActor returns).
 */
export function customFieldViewerFor(user: Pick<User, "isAdmin"> | null, roleIds: string[]): CustomFieldViewer {
  return { isAdmin: user?.isAdmin ?? false, roleIds };
}
