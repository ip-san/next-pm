/** An LDAP authentication source as the admin sees it. The bind password is never part of it, only whether one is set. */
export interface LdapAuthSource {
  id: string;
  name: string;
  host: string;
  port: number;
  account: string | null;
  hasAccountPassword: boolean;
  baseDn: string;
  attrLogin: string;
  attrFirstname: string;
  attrLastname: string;
  attrMail: string;
  tls: boolean;
  verifyPeer: boolean;
  onthefly: boolean;
  filter: string | null;
}

/** The fields an admin submits. `password` is the new bind password: null keeps the stored one, "" clears it. */
export interface LdapAuthSourceInput {
  name: string;
  host: string;
  port: number;
  account: string | null;
  password: string | null;
  baseDn: string;
  attrLogin: string;
  attrFirstname: string;
  attrLastname: string;
  attrMail: string;
  tls: boolean;
  verifyPeer: boolean;
  onthefly: boolean;
  filter: string | null;
}

/** A host name or address: letters, digits, dots, dashes, underscores, colons (IPv6) and brackets, with no scheme or path. */
const HOST_PATTERN = /^[A-Za-z0-9._\-:[\]]+$/;

/** The first problem with the input, in the admin's words, or null when it can be saved. */
export function validateLdapAuthSourceInput(input: LdapAuthSourceInput): string | null {
  if (input.name.trim().length === 0 || input.name.length > 60) return "名前は1〜60文字で入力してください。";
  if (!HOST_PATTERN.test(input.host.trim())) return "ホストはホスト名かIPアドレスで入力してください(スキームやパスは不要です)。";
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) return "ポートは1〜65535の整数で入力してください。";
  if (input.attrLogin.trim().length === 0) return "ログイン属性を入力してください。";
  if (input.filter !== null && input.filter.trim() !== "" && !(input.filter.startsWith("(") && input.filter.endsWith(")"))) {
    return "フィルタはLDAPフィルタの形式(括弧で囲む)で入力してください。";
  }
  return null;
}
