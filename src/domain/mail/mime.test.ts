import { describe, expect, it } from "bun:test";
import { decodeEncodedWords, parseMime } from "./mime";

function message(lines: string[]): string {
  return lines.join("\r\n");
}

describe("parseMime", () => {
  it("parses sender, subject, and body from a plain message", () => {
    const parsed = parseMime(message(["From: Alice <alice@example.com>", "Subject: Something broke", "", "It broke.", ""]));
    expect(parsed.fromEmail).toBe("alice@example.com");
    expect(parsed.fromName).toBe("Alice");
    expect(parsed.subject).toBe("Something broke");
    expect(parsed.textBody.trim()).toBe("It broke.");
  });

  it("lowercases the sender address and accepts a bare address", () => {
    expect(parseMime("From: Alice@Example.com\nSubject: Hi\n\nBody").fromEmail).toBe("alice@example.com");
  });

  it("unfolds a continuation-line subject", () => {
    expect(parseMime("From: a@example.com\nSubject: This is a long\n  subject line\n\nBody").subject).toBe(
      "This is a long subject line",
    );
  });

  it("collects To and Cc addresses across folded and repeated headers", () => {
    const parsed = parseMime(
      message([
        "From: a@example.com",
        "To: Bob <BOB@example.com>, carol@example.com",
        "Cc: dave@example.com",
        "Cc: erin@example.com",
        "Subject: Hi",
        "",
        "Body",
      ]),
    );
    expect(parsed.to).toEqual(["bob@example.com", "carol@example.com"]);
    expect(parsed.cc).toEqual(["dave@example.com", "erin@example.com"]);
  });

  it("does not split an address list on a comma inside a quoted display name", () => {
    const parsed = parseMime('From: a@example.com\nTo: "Doe, Jane" <jane@example.com>\nSubject: Hi\n\nBody');
    expect(parsed.to).toEqual(["jane@example.com"]);
  });

  it("decodes a base64 body", () => {
    const parsed = parseMime(
      message([
        "From: a@example.com",
        "Subject: Hi",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from("壊れました", "utf8").toString("base64"),
        "",
      ]),
    );
    expect(parsed.textBody.trim()).toBe("壊れました");
  });

  it("decodes a quoted-printable body including soft line breaks", () => {
    const parsed = parseMime(
      message([
        "From: a@example.com",
        "Subject: Hi",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "caf=C3=A9 and a very long li=",
        "ne",
        "",
      ]),
    );
    expect(parsed.textBody.trim()).toBe("café and a very long line");
  });

  it("decodes a non-UTF-8 charset", () => {
    const body = Buffer.from([0x82, 0xa0, 0x82, 0xa2]); // あい in Shift_JIS
    const raw = Buffer.concat([
      Buffer.from(
        message(["From: a@example.com", "Subject: Hi", "Content-Type: text/plain; charset=Shift_JIS", "", ""]),
        "latin1",
      ),
      body,
    ]);
    expect(parseMime(raw).textBody.trim()).toBe("あい");
  });

  it("prefers nothing and keeps both parts of a multipart/alternative", () => {
    const parsed = parseMime(
      message([
        "From: a@example.com",
        "Subject: Hi",
        'Content-Type: multipart/alternative; boundary="b1"',
        "",
        "--b1",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "plain version",
        "--b1",
        "Content-Type: text/html; charset=utf-8",
        "",
        "<p>html version</p>",
        "--b1--",
        "",
      ]),
    );
    expect(parsed.textBody.trim()).toBe("plain version");
    expect(parsed.htmlBody.trim()).toBe("<p>html version</p>");
  });

  it("walks a multipart/alternative nested inside a multipart/mixed and collects attachments", () => {
    const parsed = parseMime(
      message([
        "From: a@example.com",
        "Subject: Hi",
        'Content-Type: multipart/mixed; boundary="outer"',
        "",
        "preamble is ignored",
        "--outer",
        'Content-Type: multipart/alternative; boundary="inner"',
        "",
        "--inner",
        "Content-Type: text/plain",
        "",
        "the note",
        "--inner--",
        "--outer",
        "Content-Type: application/pdf; name=report.pdf",
        "Content-Disposition: attachment; filename=report.pdf",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from("%PDF-1.4", "utf8").toString("base64"),
        "--outer--",
        "",
      ]),
    );
    expect(parsed.textBody.trim()).toBe("the note");
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0].filename).toBe("report.pdf");
    expect(parsed.attachments[0].contentType).toBe("application/pdf");
    expect(parsed.attachments[0].content.toString("utf8")).toBe("%PDF-1.4");
  });

  it("treats an inline image with a filename as an attachment, not as body text", () => {
    const parsed = parseMime(
      message([
        "From: a@example.com",
        "Subject: Hi",
        'Content-Type: multipart/mixed; boundary="b"',
        "",
        "--b",
        "Content-Type: text/plain",
        "",
        "see below",
        "--b",
        "Content-Type: image/png; name=shot.png",
        "Content-Disposition: inline; filename=shot.png",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
        "--b--",
        "",
      ]),
    );
    expect(parsed.textBody.trim()).toBe("see below");
    expect(parsed.attachments.map((a) => a.filename)).toEqual(["shot.png"]);
  });

  it("drops a zero-byte attachment, as Redmine does", () => {
    const parsed = parseMime(
      message([
        "From: a@example.com",
        "Subject: Hi",
        'Content-Type: multipart/mixed; boundary="b"',
        "",
        "--b",
        "Content-Type: text/plain",
        "",
        "body",
        "--b",
        "Content-Type: application/octet-stream",
        "Content-Disposition: attachment; filename=empty.bin",
        "",
        "--b--",
        "",
      ]),
    );
    expect(parsed.attachments).toEqual([]);
  });

  it("decodes an RFC 2231 attachment filename", () => {
    const parsed = parseMime(
      message([
        "From: a@example.com",
        "Subject: Hi",
        'Content-Type: multipart/mixed; boundary="b"',
        "",
        "--b",
        "Content-Type: application/octet-stream",
        "Content-Disposition: attachment; filename*=utf-8''%E8%B3%87%E6%96%99.txt",
        "",
        "data",
        "--b--",
        "",
      ]),
    );
    expect(parsed.attachments[0].filename).toBe("資料.txt");
  });

  it("collects In-Reply-To and References message ids", () => {
    const parsed = parseMime(
      message([
        "From: a@example.com",
        "Subject: Hi",
        "In-Reply-To: <one@example.com>",
        "References: <root@example.com> <one@example.com>",
        "",
        "Body",
      ]),
    );
    expect(parsed.references).toEqual(["one@example.com", "root@example.com", "one@example.com"]);
  });

  it("returns an empty sender rather than throwing when From is missing", () => {
    const parsed = parseMime("Subject: Hi\n\nBody");
    expect(parsed.fromEmail).toBe("");
    expect(parsed.textBody.trim()).toBe("Body");
  });
});

describe("decodeEncodedWords", () => {
  it("decodes a base64 encoded-word subject", () => {
    expect(decodeEncodedWords("=?UTF-8?B?5aOK44KM44G+44GX44Gf?=")).toBe("壊れました");
  });

  it("decodes a quoted-printable encoded-word with underscores as spaces", () => {
    expect(decodeEncodedWords("=?iso-8859-1?Q?caf=E9_time?=")).toBe("café time");
  });

  it("joins adjacent encoded-words without inserting the separating whitespace", () => {
    expect(decodeEncodedWords("=?UTF-8?B?5aOK?= =?UTF-8?B?44KM?=")).toBe("壊れ");
  });

  it("leaves plain text untouched", () => {
    expect(decodeEncodedWords("Something broke")).toBe("Something broke");
  });
});
