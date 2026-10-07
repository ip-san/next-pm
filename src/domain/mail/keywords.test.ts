import { describe, expect, it } from "bun:test";
import { extractIssueKeywords, extractKeyword, parseAllowOverride, parseKeywordBool } from "./keywords";

describe("parseAllowOverride", () => {
  it("normalizes case, spacing and separators", () => {
    expect(parseAllowOverride(" Status , Fixed Version ,,assigned_to ")).toEqual([
      "status",
      "fixed_version",
      "assigned_to",
    ]);
  });

  it("returns an empty list for an absent value", () => {
    expect(parseAllowOverride(undefined)).toEqual([]);
  });
});

describe("extractKeyword", () => {
  it("returns the value and the body without the keyword line", () => {
    const extracted = extractKeyword("Status: 解決\nthe note", ["Status", "ステータス"]);
    expect(extracted).toEqual({ value: "解決", text: "the note" });
  });

  it("matches the label case-insensitively", () => {
    expect(extractKeyword("status:  Closed\nnote", ["Status"])?.value).toBe("Closed");
  });

  it("only matches a keyword on a line of its own", () => {
    expect(extractKeyword("please set Status: Closed today", ["Status"])).toBeNull();
  });

  it("honours a value format", () => {
    expect(extractKeyword("Due date: tomorrow\nnote", ["Due date"], "\\d{4}-\\d{2}-\\d{2}")).toBeNull();
    expect(extractKeyword("Due date: 2026-03-01\nnote", ["Due date"], "\\d{4}-\\d{2}-\\d{2}")?.value).toBe("2026-03-01");
  });
});

describe("extractIssueKeywords", () => {
  const body = ["Status: 解決", "Assigned to: bob", "Due date: 2026-03-01", "", "please take a look"].join("\n");

  it("extracts nothing when allow_override is empty", () => {
    const result = extractIssueKeywords(body, { allowOverride: [], customFieldNames: [] });
    expect(result.attributes).toEqual({});
    expect(result.body).toBe(body.trim());
  });

  it("extracts only the attributes listed in allow_override", () => {
    const result = extractIssueKeywords(body, { allowOverride: ["status"], customFieldNames: [] });
    expect(result.attributes).toEqual({ status: "解決" });
    expect(result.body).toBe(["Assigned to: bob", "Due date: 2026-03-01", "", "please take a look"].join("\n"));
  });

  it("extracts everything with allow_override=all and leaves only the prose", () => {
    const result = extractIssueKeywords(body, { allowOverride: ["all"], customFieldNames: [] });
    expect(result.attributes).toEqual({ status: "解決", assigned_to: "bob", due_date: "2026-03-01" });
    expect(result.body).toBe("please take a look");
  });

  it("accepts the Japanese field labels", () => {
    const result = extractIssueKeywords("ステータス: 終了\n進捗率: 100\n本文", {
      allowOverride: ["all"],
      customFieldNames: [],
    });
    expect(result.attributes).toEqual({ status: "終了", done_ratio: "100" });
    expect(result.body).toBe("本文");
  });

  it("rejects a done ratio that is not a multiple of ten", () => {
    const result = extractIssueKeywords("Done ratio: 35\nnote", { allowOverride: ["all"], customFieldNames: [] });
    expect(result.attributes.done_ratio).toBeUndefined();
  });

  it("extracts a custom field by name when it is overridable", () => {
    const result = extractIssueKeywords("Severity: high\nnote", {
      allowOverride: ["severity"],
      customFieldNames: ["Severity"],
    });
    expect(result.customFields).toEqual({ Severity: "high" });
    expect(result.body).toBe("note");
  });
});

describe("parseKeywordBool", () => {
  it("accepts Redmine's 1/0 and the yes/no words", () => {
    expect(parseKeywordBool("1")).toBe(true);
    expect(parseKeywordBool("はい")).toBe(true);
    expect(parseKeywordBool("0")).toBe(false);
    expect(parseKeywordBool("No")).toBe(false);
    expect(parseKeywordBool("maybe")).toBeNull();
  });
});
