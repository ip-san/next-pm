import { describe, expect, it } from "bun:test";
import { checkPasswordPolicy, describePasswordPolicyFailure } from "./password-policy";

const basePolicy = { minLength: 8, requiredCharClasses: [] as never[] };

describe("checkPasswordPolicy", () => {
  it("accepts a password at exactly the minimum length", () => {
    expect(checkPasswordPolicy("12345678", basePolicy)).toEqual([]);
  });

  it("rejects a password below the minimum length", () => {
    expect(checkPasswordPolicy("1234567", basePolicy)).toEqual([{ kind: "too_short", minLength: 8 }]);
  });

  it("reports every missing character class at once", () => {
    expect(
      checkPasswordPolicy("lowercaseonly", { minLength: 8, requiredCharClasses: ["uppercase", "digits", "special_chars"] }),
    ).toEqual([{ kind: "missing_char_classes", charClasses: ["uppercase", "digits", "special_chars"] }]);
  });

  it("accepts a password that satisfies every required class", () => {
    expect(
      checkPasswordPolicy("Passw0rd!", { minLength: 8, requiredCharClasses: ["uppercase", "lowercase", "digits", "special_chars"] }),
    ).toEqual([]);
  });

  it("rejects a password that merely repeats the login, a name or an email address, ignoring case", () => {
    const owner = { login: "jsmith", firstname: "John", lastname: "Smith", mails: ["john@example.com"] };
    expect(checkPasswordPolicy("JSMITH", { ...basePolicy, minLength: 6 }, owner)).toEqual([{ kind: "too_simple" }]);
    expect(checkPasswordPolicy("john@example.com", basePolicy, owner)).toEqual([{ kind: "too_simple" }]);
    expect(checkPasswordPolicy("unrelated-secret", basePolicy, owner)).toEqual([]);
  });

  it("accumulates length and class violations together", () => {
    expect(checkPasswordPolicy("abc", { minLength: 8, requiredCharClasses: ["digits"] })).toHaveLength(2);
  });
});

describe("describePasswordPolicyFailure", () => {
  it("returns null for an acceptable password", () => {
    expect(describePasswordPolicyFailure("12345678", basePolicy)).toBeNull();
  });

  it("joins every violation into one message", () => {
    const message = describePasswordPolicyFailure("abc", { minLength: 8, requiredCharClasses: ["digits", "uppercase"] });
    expect(message).toContain("8文字以上");
    expect(message).toContain("数字");
    expect(message).toContain("大文字");
  });
});
