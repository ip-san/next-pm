import { describe, expect, it, mock } from "bun:test";
import { decryptSecret } from "@/domain/crypto/symmetric";
import type { LdapAuthSource, LdapAuthSourceInput } from "@/domain/ldap/auth-source";
import type { LdapAuthSourceRepository } from "@/domain/ldap/repository";
import { LdapAuthSourceError, saveLdapAuthSource } from "./save-ldap-auth-source";

const key = Buffer.alloc(32, 7);

const input: LdapAuthSourceInput = {
  name: "Corp",
  host: "ldap.example.com",
  port: 389,
  account: "cn=svc,dc=example,dc=com",
  password: "bind-secret",
  baseDn: "dc=example,dc=com",
  attrLogin: "uid",
  attrFirstname: "givenName",
  attrLastname: "sn",
  attrMail: "mail",
  tls: false,
  verifyPeer: true,
  onthefly: false,
  filter: null,
};

function repository() {
  const saved: LdapAuthSource = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Corp",
    host: "ldap.example.com",
    port: 389,
    account: null,
    hasAccountPassword: true,
    baseDn: "",
    attrLogin: "uid",
    attrFirstname: "givenName",
    attrLastname: "sn",
    attrMail: "mail",
    tls: false,
    verifyPeer: true,
    onthefly: false,
    filter: null,
  };
  return {
    create: mock(async () => saved),
    update: mock(async () => saved),
    listAll: mock(async () => []),
    findById: mock(async () => saved),
    delete: mock(async () => {}),
  } as unknown as LdapAuthSourceRepository & { create: ReturnType<typeof mock>; update: ReturnType<typeof mock> };
}

describe("saveLdapAuthSource", () => {
  it("stores a new bind password encrypted, never in clear", async () => {
    const repo = repository();
    await saveLdapAuthSource(repo, key, input, null);
    const stored = (repo.create as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as string;
    expect(stored).not.toContain("bind-secret");
    expect(decryptSecret(stored, key)).toBe("bind-secret");
  });

  it("refuses to store a password when no encryption key is configured", async () => {
    const repo = repository();
    await expect(saveLdapAuthSource(repo, null, input, null)).rejects.toBeInstanceOf(LdapAuthSourceError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("saves a source without a password when no key is configured and no password is given", async () => {
    const repo = repository();
    await saveLdapAuthSource(repo, null, { ...input, password: null }, null);
    expect(repo.create).toHaveBeenCalled();
  });

  it("keeps the stored password when the edit leaves it blank", async () => {
    const repo = repository();
    await saveLdapAuthSource(repo, key, { ...input, password: null }, "00000000-0000-4000-8000-000000000001");
    expect((repo.update as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][2]).toBeUndefined();
  });

  it("clears the stored password on an empty value", async () => {
    const repo = repository();
    await saveLdapAuthSource(repo, key, { ...input, password: "" }, "00000000-0000-4000-8000-000000000001");
    expect((repo.update as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][2]).toBeNull();
  });

  it("refuses an invalid source before writing", async () => {
    const repo = repository();
    await expect(saveLdapAuthSource(repo, key, { ...input, host: "ldap://x" }, null)).rejects.toBeInstanceOf(LdapAuthSourceError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("says so when the name is already taken, instead of failing with a database error", async () => {
    const repo = repository();
    (repo.create as unknown as ReturnType<typeof mock>).mockImplementation(async () => {
      throw Object.assign(new Error("duplicate key"), { code: "23505" });
    });
    await expect(saveLdapAuthSource(repo, key, input, null)).rejects.toThrow("同じ名前の認証元が既にあります。");
  });
});
