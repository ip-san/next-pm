import { describe, expect, it } from "bun:test";
import { InvalidRefError, InvalidRepositoryPathError, validateRef, validateRepositoryPath } from "./validate-path";

describe("validateRepositoryPath", () => {
  it("accepts a normal relative path", () => {
    expect(() => validateRepositoryPath("src/index.ts")).not.toThrow();
  });

  it("accepts the empty path (repo root)", () => {
    expect(() => validateRepositoryPath("")).not.toThrow();
  });

  it("rejects an absolute path", () => {
    expect(() => validateRepositoryPath("/etc/passwd")).toThrow(InvalidRepositoryPathError);
  });

  it("rejects a path containing a .. segment", () => {
    expect(() => validateRepositoryPath("../../etc/passwd")).toThrow(InvalidRepositoryPathError);
  });

  it("rejects a .. segment in the middle of the path", () => {
    expect(() => validateRepositoryPath("src/../../etc/passwd")).toThrow(InvalidRepositoryPathError);
  });
});

describe("validateRef", () => {
  it("accepts a normal branch/tag/sha name", () => {
    expect(() => validateRef("main")).not.toThrow();
    expect(() => validateRef("HEAD")).not.toThrow();
    expect(() => validateRef("a1b2c3d")).not.toThrow();
  });

  it("rejects an empty ref", () => {
    expect(() => validateRef("")).toThrow(InvalidRefError);
  });

  it("rejects a ref starting with - (argument injection)", () => {
    expect(() => validateRef("--upload-pack=/bin/sh")).toThrow(InvalidRefError);
  });
});
