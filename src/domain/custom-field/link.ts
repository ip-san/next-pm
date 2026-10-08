/**
 * The href for a `link` custom field value. Redmine's LinkFormat uses the value as-is when it
 * starts with a scheme, and prepends "http://" when it doesn't. Here only http and https pass
 * through: any other scheme (javascript:, data:) would be a script link, so it gets the same
 * "http://" prefix as a bare host, which makes it an ordinary, harmless URL.
 */
export function linkHref(value: string): string {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}
