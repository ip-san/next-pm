import type { LdapAuthSource, LdapAuthSourceInput } from "./auth-source";

export interface LdapAuthSourceRepository {
  listAll(): Promise<LdapAuthSource[]>;
  findById(id: string): Promise<LdapAuthSource | null>;
  /** `encryptedPassword` is the stored form of the bind password, or null for none. */
  create(input: LdapAuthSourceInput, encryptedPassword: string | null): Promise<LdapAuthSource>;
  /** `encryptedPassword` undefined keeps the stored password; null clears it; a string replaces it. */
  update(id: string, input: LdapAuthSourceInput, encryptedPassword: string | null | undefined): Promise<LdapAuthSource>;
  /** How many user accounts were created through this source. A source with accounts can't be deleted. */
  countUsers(id: string): Promise<number>;
  delete(id: string): Promise<void>;
  /** Every source with its stored (encrypted) bind password, for building the sign-in connections. */
  listWithEncryptedPasswords(): Promise<{ source: LdapAuthSource; encryptedPassword: string | null }[]>;
}
