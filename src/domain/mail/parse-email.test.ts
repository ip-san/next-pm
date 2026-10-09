import { describe, expect, it } from "bun:test";
import {
  extractIssueReplyRef,
  extractMessageReplyIdPrefix,
  isAutoSubmitted,
  parseEmail,
  plainTextBody,
  projectIdentifierFromSubaddress,
  stripMessageReplyToken,
} from "./parse-email";

function message(lines: string[]): string {
  return lines.join("\r\n");
}

describe("plainTextBody", () => {
  const multipart = message([
    "From: a@example.com",
    "Subject: Hi",
    'Content-Type: multipart/alternative; boundary="b"',
    "",
    "--b",
    "Content-Type: text/plain",
    "",
    "plain version",
    "--b",
    "Content-Type: text/html",
    "",
    "<p>html <b>version</b></p>",
    "--b--",
    "",
  ]);

  it("prefers the text/plain part by default", () => {
    expect(plainTextBody(parseEmail(multipart), "plain")).toBe("plain version");
  });

  it("prefers the html part converted to text when configured to", () => {
    expect(plainTextBody(parseEmail(multipart), "html")).toBe("html version");
  });

  it("falls back to the html part when there is no plain part", () => {
    const htmlOnly = message(["From: a@example.com", "Subject: Hi", "Content-Type: text/html", "", "<p>only html</p>", ""]);
    expect(plainTextBody(parseEmail(htmlOnly), "plain")).toBe("only html");
  });

  it("returns an empty string for a mail that carries only an attachment", () => {
    const attachmentOnly = message([
      "From: a@example.com",
      "Subject: Hi",
      'Content-Type: multipart/mixed; boundary="b"',
      "",
      "--b",
      "Content-Type: application/pdf",
      "Content-Disposition: attachment; filename=x.pdf",
      "",
      "data",
      "--b--",
      "",
    ]);
    expect(plainTextBody(parseEmail(attachmentOnly), "plain")).toBe("");
  });
});

describe("isAutoSubmitted", () => {
  it("detects the Auto-Submitted header", () => {
    const raw = "From: a@example.com\nAuto-Submitted: auto-replied\nSubject: Out of office\n\nBody";
    expect(isAutoSubmitted(parseEmail(raw))).toBe(true);
  });

  it("detects X-Autoreply", () => {
    expect(isAutoSubmitted(parseEmail("From: a@example.com\nX-Autoreply: yes\nSubject: Hi\n\nBody"))).toBe(true);
  });

  it("leaves ordinary mail alone", () => {
    expect(isAutoSubmitted(parseEmail("From: a@example.com\nAuto-Submitted: no\nSubject: Hi\n\nBody"))).toBe(false);
  });
});

describe("extractIssueReplyRef", () => {
  it("extracts the 8-hex-char prefix from a reply-style subject", () => {
    expect(extractIssueReplyRef("Re: [MyProject - Bug #eb0b2d1a] Something broke")).toBe("eb0b2d1a");
  });

  it("lowercases the extracted prefix", () => {
    expect(extractIssueReplyRef("[Proj #EB0B2D1A] Subject")).toBe("eb0b2d1a");
  });

  it("returns null for a subject that isn't a reply", () => {
    expect(extractIssueReplyRef("Something broke")).toBeNull();
  });

  it("returns null for a bracketed subject with no # prefix", () => {
    expect(extractIssueReplyRef("[MyProject] Something broke")).toBeNull();
  });
});

describe("extractMessageReplyIdPrefix", () => {
  it("extracts the forum message prefix", () => {
    expect(extractMessageReplyIdPrefix("Re: [MyProject - General - msg1a2b3c4d] Topic")).toBe("1a2b3c4d");
  });

  it("is not confused by an issue reply subject", () => {
    expect(extractMessageReplyIdPrefix("Re: [MyProject #eb0b2d1a] Something")).toBeNull();
  });

  it("strips the routing token from the reply subject", () => {
    expect(stripMessageReplyToken("Re: [MyProject - General - msg1a2b3c4d] Topic")).toBe("Topic");
  });
});

describe("projectIdentifierFromSubaddress", () => {
  const mail = (to: string) => parseEmail(`From: a@example.com\nTo: ${to}\nSubject: Hi\n\nBody`);

  it("reads the project identifier out of a plus-addressed recipient", () => {
    expect(projectIdentifierFromSubaddress(mail("redmine+myproject@example.com"), "redmine@example.com")).toBe("myproject");
  });

  it("ignores a recipient on another domain", () => {
    expect(projectIdentifierFromSubaddress(mail("redmine+myproject@other.com"), "redmine@example.com")).toBeNull();
  });

  it("ignores a plain recipient with no sub-address", () => {
    expect(projectIdentifierFromSubaddress(mail("redmine@example.com"), "redmine@example.com")).toBeNull();
  });

  it("ignores a sub-address with more than one segment", () => {
    expect(projectIdentifierFromSubaddress(mail("redmine+a+b@example.com"), "redmine@example.com")).toBeNull();
  });

  it("returns null when no sub-address is configured", () => {
    expect(projectIdentifierFromSubaddress(mail("redmine+myproject@example.com"), "")).toBeNull();
  });
});
