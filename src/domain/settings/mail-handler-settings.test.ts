import { describe, expect, it } from "bun:test";
import { isExcludedAttachmentFilename, resolveMailHandlerSettings } from "./mail-handler-settings";

describe("resolveMailHandlerSettings", () => {
  it("keeps the endpoint enabled by default so an existing env-key deployment keeps working", () => {
    const settings = resolveMailHandlerSettings({});
    expect(settings.apiEnabled).toBe(true);
    expect(settings.apiKey).toBe("");
    expect(settings.preferredBodyPart).toBe("plain");
  });

  it("lets an admin disable the endpoint", () => {
    expect(resolveMailHandlerSettings({ mail_handler_api_enabled: "0" }).apiEnabled).toBe(false);
  });

  it("trims the stored api key", () => {
    expect(resolveMailHandlerSettings({ mail_handler_api_key: "  secret  " }).apiKey).toBe("secret");
  });

  it("falls back to plain for an unknown preferred body part", () => {
    expect(resolveMailHandlerSettings({ mail_handler_preferred_body_part: "rtf" }).preferredBodyPart).toBe("plain");
    expect(resolveMailHandlerSettings({ mail_handler_preferred_body_part: "html" }).preferredBodyPart).toBe("html");
  });
});

describe("isExcludedAttachmentFilename", () => {
  const settings = (overrides: Record<string, string>) => resolveMailHandlerSettings(overrides);

  it("excludes nothing when the list is empty", () => {
    expect(isExcludedAttachmentFilename("signature.asc", settings({}))).toBe(false);
  });

  it("matches a literal filename case-insensitively", () => {
    const s = settings({ mail_handler_excluded_filenames: "signature.asc, smime.p7s" });
    expect(isExcludedAttachmentFilename("Signature.asc", s)).toBe(true);
    expect(isExcludedAttachmentFilename("report.pdf", s)).toBe(false);
  });

  it("treats * as a wildcard in a literal pattern", () => {
    const s = settings({ mail_handler_excluded_filenames: "*.vcf" });
    expect(isExcludedAttachmentFilename("alice.vcf", s)).toBe(true);
    expect(isExcludedAttachmentFilename("alice.vcf.pdf", s)).toBe(false);
  });

  it("does not let a dot in a literal pattern act as a wildcard", () => {
    const s = settings({ mail_handler_excluded_filenames: "a.txt" });
    expect(isExcludedAttachmentFilename("axtxt", s)).toBe(false);
  });

  it("uses the pattern as a regular expression when enabled", () => {
    const s = settings({
      mail_handler_excluded_filenames: "image\\d+\\.png",
      mail_handler_enable_regex_excluded_filenames: "1",
    });
    expect(isExcludedAttachmentFilename("image12.png", s)).toBe(true);
    expect(isExcludedAttachmentFilename("imagex.png", s)).toBe(false);
  });

  it("ignores an invalid regular expression rather than excluding everything", () => {
    const s = settings({
      mail_handler_excluded_filenames: "[unclosed",
      mail_handler_enable_regex_excluded_filenames: "1",
    });
    expect(isExcludedAttachmentFilename("report.pdf", s)).toBe(false);
  });
});
