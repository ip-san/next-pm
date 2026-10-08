import { describe, expect, it } from "bun:test";
import {
  compareScmRepositories,
  isScmRepositoryIdentifierFrozen,
  normalizeScmRepositoryIdentifier,
  resolveScmRepositoryByParam,
  scmRepositoryIdentifierParam,
  validateScmRepositoryIdentifier,
} from "./identifier";

describe("normalizeScmRepositoryIdentifier", () => {
  it("strips surrounding whitespace, as Redmine's before_validation does", () => {
    expect(normalizeScmRepositoryIdentifier("  docs \n")).toBe("docs");
  });
});

describe("validateScmRepositoryIdentifier", () => {
  it("accepts a blank identifier (Redmine's allow_blank)", () => {
    expect(validateScmRepositoryIdentifier("")).toBeNull();
  });

  it("accepts lowercase letters, digits, dashes and underscores", () => {
    for (const identifier of ["docs", "a", "web-app", "web_app", "v2", "a1-b_2"]) {
      expect(validateScmRepositoryIdentifier(identifier)).toBeNull();
    }
  });

  it("rejects anything outside that character set", () => {
    for (const identifier of ["Docs", "with space", "dots.here", "slash/es", "ümlaut"]) {
      expect(validateScmRepositoryIdentifier(identifier)).toBe("malformed");
    }
  });

  it("rejects an all-digit identifier", () => {
    expect(validateScmRepositoryIdentifier("123")).toBe("malformed");
    expect(validateScmRepositoryIdentifier("1a")).toBeNull();
  });

  it("rejects Redmine's reserved repository route names", () => {
    for (const identifier of ["browse", "show", "entry", "raw", "changes", "annotate", "diff", "statistics", "graph", "revisions", "revision"]) {
      expect(validateScmRepositoryIdentifier(identifier)).toBe("reserved");
    }
  });

  it("also rejects next-pm's own extra static segment", () => {
    expect(validateScmRepositoryIdentifier("blame")).toBe("reserved");
  });

  it("rejects an identifier over 255 characters", () => {
    expect(validateScmRepositoryIdentifier("a".repeat(255))).toBeNull();
    expect(validateScmRepositoryIdentifier("a".repeat(256))).toBe("too_long");
  });
});

describe("isScmRepositoryIdentifierFrozen", () => {
  it("freezes a persisted non-blank identifier but leaves a blank one editable", () => {
    expect(isScmRepositoryIdentifierFrozen("docs")).toBe(true);
    expect(isScmRepositoryIdentifierFrozen("")).toBe(false);
  });
});

describe("scmRepositoryIdentifierParam", () => {
  it("uses the identifier when there is one, and the id otherwise", () => {
    expect(scmRepositoryIdentifierParam({ id: "repo-1", identifier: "docs" })).toBe("docs");
    expect(scmRepositoryIdentifierParam({ id: "repo-1", identifier: "" })).toBe("repo-1");
  });
});

describe("resolveScmRepositoryByParam", () => {
  const repositories = [
    { id: "11111111-1111-4111-8111-111111111111", identifier: "docs" },
    { id: "22222222-2222-4222-8222-222222222222", identifier: "" },
  ];

  it("resolves by identifier", () => {
    expect(resolveScmRepositoryByParam(repositories, "docs")?.id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("resolves an unnamed repository by its id", () => {
    expect(resolveScmRepositoryByParam(repositories, "22222222-2222-4222-8222-222222222222")?.identifier).toBe("");
  });

  it("returns null for a param that matches nothing (Redmine 404s rather than falling back)", () => {
    expect(resolveScmRepositoryByParam(repositories, "nope")).toBeNull();
    expect(resolveScmRepositoryByParam(repositories, "33333333-3333-4333-8333-333333333333")).toBeNull();
  });
});

describe("compareScmRepositories", () => {
  it("sorts the default first, then by identifier", () => {
    const repositories = [
      { identifier: "zeta", isDefault: false },
      { identifier: "alpha", isDefault: false },
      { identifier: "main", isDefault: true },
    ];
    expect([...repositories].sort(compareScmRepositories).map((r) => r.identifier)).toEqual(["main", "alpha", "zeta"]);
  });
});
