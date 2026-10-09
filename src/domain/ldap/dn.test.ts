import { describe, expect, it } from "bun:test";
import { escapeLdapDnValue, escapeLdapFilterValue, loginSearchFilter, substituteLoginInAccount } from "./dn";

describe("escapeLdapDnValue", () => {
  it("passes through a plain login unchanged", () => {
    expect(escapeLdapDnValue("alice")).toBe("alice");
  });

  it("escapes DN-special characters", () => {
    expect(escapeLdapDnValue('a,b+c"d\\e<f>g;h=i')).toBe('a\\,b\\+c\\"d\\\\e\\<f\\>g\\;h\\=i');
  });

  it("escapes a leading space", () => {
    expect(escapeLdapDnValue(" alice")).toBe("\\ alice");
  });

  it("escapes a leading #", () => {
    expect(escapeLdapDnValue("#alice")).toBe("\\#alice");
  });

  it("escapes a trailing space", () => {
    expect(escapeLdapDnValue("alice ")).toBe("alice\\ ");
  });

  it("neutralizes an attempt to break out of the RDN and append extra components", () => {
    // A naive template substitution of "uid=$login,ou=people,dc=example,dc=com" with an
    // unescaped login would let an attacker-controlled login string inject its own RDNs.
    const malicious = "alice,dc=evil,dc=com";
    const escaped = escapeLdapDnValue(malicious);
    expect(escaped).toBe("alice\\,dc\\=evil\\,dc\\=com");
  });
});

describe("substituteLoginInAccount", () => {
  it("substitutes an escaped login into the template", () => {
    expect(substituteLoginInAccount("uid=$login,ou=people,dc=example,dc=com", "alice")).toBe(
      "uid=alice,ou=people,dc=example,dc=com",
    );
  });

  it("escapes a login containing DN-special characters before substitution", () => {
    expect(substituteLoginInAccount("uid=$login,ou=people,dc=example,dc=com", "alice,dc=evil")).toBe(
      "uid=alice\\,dc\\=evil,ou=people,dc=example,dc=com",
    );
  });
});

describe("escapeLdapFilterValue", () => {
  it("passes through a plain login unchanged", () => {
    expect(escapeLdapFilterValue("alice")).toBe("alice");
  });

  it("escapes filter-special characters", () => {
    expect(escapeLdapFilterValue("a*b(c)d\\e\0f")).toBe("a\\2ab\\28c\\29d\\5ce\\00f");
  });

  it("neutralizes an attempt to widen the filter with a wildcard", () => {
    expect(escapeLdapFilterValue("*")).toBe("\\2a");
  });
});

describe("loginSearchFilter", () => {
  it("matches the login attribute on its own without an extra filter", () => {
    expect(loginSearchFilter("uid", "ada", null)).toBe("(uid=ada)");
  });

  it("ANDs the source's filter onto the login match", () => {
    expect(loginSearchFilter("uid", "ada", "(objectClass=person)")).toBe("(&(uid=ada)(objectClass=person))");
  });

  it("escapes the login so it can't add a filter clause", () => {
    expect(loginSearchFilter("uid", "a)(uid=*", null)).not.toBe("(uid=a)(uid=*)");
  });
});
