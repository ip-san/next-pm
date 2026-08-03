/**
 * Mirrors Net::LDAP::DN.escape / Redmine's account "$login" substitution — the login (untrusted
 * user input) must never be allowed to inject extra RDN components into a bind DN template like
 * "uid=$login,ou=people,dc=example,dc=com".
 */
export function escapeLdapDnValue(value: string): string {
  let escaped = value.replace(/([,+"\\<>;=])/g, "\\$1");
  if (escaped.startsWith(" ") || escaped.startsWith("#")) {
    escaped = `\\${escaped}`;
  }
  if (escaped.endsWith(" ") && !escaped.endsWith("\\ ")) {
    escaped = `${escaped.slice(0, -1)}\\ `;
  }
  return escaped;
}

/** Substitutes an escaped login into an account DN template containing the literal "$login". */
export function substituteLoginInAccount(account: string, login: string): string {
  return account.replace("$login", escapeLdapDnValue(login));
}

/**
 * RFC 4515 filter escaping — a login used inside a search filter like "(uid=$login)" must have
 * its filter-special characters escaped so it can't widen or invert the search.
 */
export function escapeLdapFilterValue(value: string): string {
  return value.replace(/[\\*()\0]/g, (char) => `\\${char.charCodeAt(0).toString(16).padStart(2, "0")}`);
}
