import type { User } from "./entity";

/**
 * Mirrors Redmine's User#own_account_deletable?:
 *
 *   Setting.unsubscribe? && (!admin? || User.active.admin.where("id <> ?", id).exists?)
 *
 * Note the second clause: an administrator *may* delete their own account, but only while
 * another active administrator remains — the rule exists to stop the last admin locking
 * everyone out of the administration screens, not to exempt admins. (A sibling agent
 * paraphrased this as "Redmine refuses self-delete for any admin"; the source says
 * otherwise, so this follows the source.)
 *
 * Separate from the admin-screen delete, which refuses self-deletion outright — Redmine
 * splits it the same way: UsersController#destroy says no, MyController#destroy is the
 * permitting path.
 */
export function ownAccountDeletable(
  user: Pick<User, "isAdmin">,
  unsubscribeEnabled: boolean,
  otherActiveAdminExists: boolean,
): boolean {
  if (!unsubscribeEnabled) {
    return false;
  }
  return !user.isAdmin || otherActiveAdminExists;
}
