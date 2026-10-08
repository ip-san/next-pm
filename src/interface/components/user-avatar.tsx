import { gravatarUrl } from "@/domain/user/avatar";

/**
 * Redmine's `avatar(user)` for a user: the Gravatar image when the Gravatar setting is on, and nothing when
 * it is off (core Redmine shows no avatar then, rather than a substitute).
 */
export function UserAvatar({ mail, gravatarEnabled, size = 16 }: { mail: string | null; gravatarEnabled: boolean; size?: number }) {
  if (!gravatarEnabled || !mail) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- an external Gravatar URL, which next/image would proxy for no benefit
    <img src={gravatarUrl(mail, size)} alt="" width={size} height={size} className="avatar gravatar inline-block rounded-full align-middle" />
  );
}
