import { describe, expect, it } from "bun:test";
import { extractIssueReplyIdPrefix, parseEmail, UnsupportedMailFormatError } from "./parse-email";

describe("parseEmail", () => {
  it("parses sender, subject, and body from a plain message", () => {
    const raw = ["From: Alice <alice@example.com>", "Subject: Something broke", "", "It broke when I clicked the button.", ""].join(
      "\r\n",
    );
    const parsed = parseEmail(raw);
    expect(parsed.fromEmail).toBe("alice@example.com");
    expect(parsed.subject).toBe("Something broke");
    expect(parsed.body).toBe("It broke when I clicked the button.");
  });

  it("extracts the address from a From header with no display name", () => {
    const raw = "From: alice@example.com\nSubject: Hi\n\nBody text";
    expect(parseEmail(raw).fromEmail).toBe("alice@example.com");
  });

  it("lowercases the extracted sender address", () => {
    const raw = "From: Alice@Example.com\nSubject: Hi\n\nBody";
    expect(parseEmail(raw).fromEmail).toBe("alice@example.com");
  });

  it("unfolds a continuation-line subject", () => {
    const raw = "From: alice@example.com\nSubject: This is a long\n  subject line\n\nBody";
    expect(parseEmail(raw).subject).toBe("This is a long subject line");
  });

  it("rejects a message with no From header", () => {
    const raw = "Subject: Hi\n\nBody";
    expect(() => parseEmail(raw)).toThrow(UnsupportedMailFormatError);
  });

  it("rejects a non-text/plain content type", () => {
    const raw = "From: alice@example.com\nSubject: Hi\nContent-Type: multipart/mixed; boundary=x\n\nBody";
    expect(() => parseEmail(raw)).toThrow(UnsupportedMailFormatError);
  });

  it("accepts an explicit text/plain content type", () => {
    const raw = "From: alice@example.com\nSubject: Hi\nContent-Type: text/plain; charset=utf-8\n\nBody";
    expect(parseEmail(raw).body).toBe("Body");
  });

  it("rejects an unsupported transfer encoding", () => {
    const raw = "From: alice@example.com\nSubject: Hi\nContent-Transfer-Encoding: base64\n\nQm9keQ==";
    expect(() => parseEmail(raw)).toThrow(UnsupportedMailFormatError);
  });

  it("accepts 7bit/8bit transfer encodings", () => {
    const raw = "From: alice@example.com\nSubject: Hi\nContent-Transfer-Encoding: 8bit\n\nBody";
    expect(parseEmail(raw).body).toBe("Body");
  });
});

describe("extractIssueReplyIdPrefix", () => {
  it("extracts the 8-hex-char prefix from a reply-style subject", () => {
    expect(extractIssueReplyIdPrefix("Re: [MyProject #eb0b2d1a] Something broke")).toBe("eb0b2d1a");
  });

  it("lowercases the extracted prefix", () => {
    expect(extractIssueReplyIdPrefix("[Proj #EB0B2D1A] Subject")).toBe("eb0b2d1a");
  });

  it("returns null for a subject that isn't a reply", () => {
    expect(extractIssueReplyIdPrefix("Something broke")).toBeNull();
  });

  it("returns null for a bracketed subject with no # prefix", () => {
    expect(extractIssueReplyIdPrefix("[MyProject] Something broke")).toBeNull();
  });
});
