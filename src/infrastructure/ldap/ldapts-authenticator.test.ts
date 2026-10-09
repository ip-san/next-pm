import { afterEach, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:net";
import type { LdapConfig } from "@/domain/ldap/config";
import { LdaptsAuthenticator } from "./ldapts-authenticator";

/**
 * A directory that answers every bind with `resultCode` and remembers who bound. The answer is the smallest
 * BindResponse BER: LDAPMessage { messageID, [APPLICATION 1] { resultCode, matchedDN "", diagnosticMessage "" } }.
 */
function fakeDirectory(resultCode: number): Promise<{ server: Server; port: number; binds: string[] }> {
  const binds: string[] = [];
  const server = createServer((socket) => {
    socket.on("data", (data) => {
      // A bind request: 30 len 02 01 <id> 60 len 02 01 <version> 04 <dnLength> <dn>…
      if (data[0] !== 0x30 || data[5] !== 0x60) return;
      const messageId = data[4];
      const dnLength = data[11];
      binds.push(data.subarray(12, 12 + dnLength).toString("utf8"));
      socket.write(Buffer.from([0x30, 0x0c, 0x02, 0x01, messageId, 0x61, 0x07, 0x0a, 0x01, resultCode, 0x04, 0x00, 0x04, 0x00]));
    });
    socket.on("error", () => {});
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: typeof address === "object" && address ? address.port : 0, binds });
    });
  });
}

function config(port: number, overrides: Partial<LdapConfig> = {}): LdapConfig {
  return {
    url: `ldap://127.0.0.1:${port}`,
    account: null,
    accountPassword: null,
    baseDn: "dc=example,dc=com",
    attrLogin: "uid",
    attrFirstname: "givenName",
    attrLastname: "sn",
    attrMail: "mail",
    verifyPeer: true,
    filter: null,
    onthefly: false,
    ...overrides,
  } as LdapConfig;
}

let running: Server | null = null;
afterEach(() => {
  running?.close();
  running = null;
});

describe("LdaptsAuthenticator.testConnection", () => {
  it("succeeds when the service account binds", async () => {
    const { server, port, binds } = await fakeDirectory(0);
    running = server;
    await new LdaptsAuthenticator(config(port, { account: "cn=admin", accountPassword: "secret" })).testConnection();
    expect(binds).toEqual(["cn=admin"]);
  });

  it("reports wrong service account credentials as Redmine does", async () => {
    const { server, port } = await fakeDirectory(49);
    running = server;
    await expect(new LdaptsAuthenticator(config(port, { account: "cn=admin", accountPassword: "wrong" })).testConnection()).rejects.toThrow(
      "Invalid LDAP Account/Password",
    );
  });

  it("counts a directory that refuses an anonymous bind as reachable when there is no service account", async () => {
    const { server, port, binds } = await fakeDirectory(53);
    running = server;
    await new LdaptsAuthenticator(config(port)).testConnection();
    expect(binds).toEqual([""]);
  });

  it("binds anonymously for a $login account template rather than with the template", async () => {
    const { server, port, binds } = await fakeDirectory(0);
    running = server;
    await new LdaptsAuthenticator(config(port, { account: "uid=$login,ou=people", accountPassword: "x" })).testConnection();
    expect(binds).toEqual([""]);
  });

  it("rejects when nothing listens", async () => {
    const { server, port } = await fakeDirectory(0);
    server.close();
    await expect(new LdaptsAuthenticator(config(port)).testConnection()).rejects.toThrow();
  });
});

describe("LdaptsAuthenticator.authenticate over plain LDAP", () => {
  it("speaks plain LDAP to an ldap:// source instead of starting TLS", async () => {
    // The fake directory only understands plain BER; a TLS ClientHello would get no answer and time out.
    const { server, port, binds } = await fakeDirectory(49);
    running = server;
    expect(await new LdaptsAuthenticator(config(port, { account: "cn=admin", accountPassword: "x" })).authenticate("alice", "pw")).toBeNull();
    expect(binds).toEqual(["cn=admin"]);
  });
});

