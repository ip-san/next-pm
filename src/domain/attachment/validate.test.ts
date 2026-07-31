import { describe, expect, it } from "bun:test";
import { InvalidAttachmentError, validateAttachmentInput } from "./validate";

describe("validateAttachmentInput", () => {
  it("accepts a normal filename and size", () => {
    expect(() => validateAttachmentInput("report.pdf", 1024)).not.toThrow();
  });

  it("rejects an empty filename", () => {
    expect(() => validateAttachmentInput("", 1024)).toThrow(InvalidAttachmentError);
  });

  it("rejects a filename longer than 255 characters", () => {
    expect(() => validateAttachmentInput("a".repeat(256), 1024)).toThrow(InvalidAttachmentError);
  });

  it("rejects a zero-byte file", () => {
    expect(() => validateAttachmentInput("empty.txt", 0)).toThrow(InvalidAttachmentError);
  });

  it("rejects a file over the max size", () => {
    expect(() => validateAttachmentInput("huge.bin", 26 * 1024 * 1024)).toThrow(InvalidAttachmentError);
  });
});
