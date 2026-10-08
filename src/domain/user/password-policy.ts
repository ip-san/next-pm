import type { PasswordCharClass } from "@/domain/settings/auth-settings";

/**
 * Mirrors Redmine's User#validate_password_length / #validate_password_complexity plus
 * Setting::PASSWORD_CHAR_CLASSES. Pulled out of change-password.ts (which hardcoded "8 or
 * more characters") so every write path — self-registration, password change, lost-password
 * reset and the admin user form — applies the same configured policy rather than each
 * inventing its own threshold.
 */
export const PASSWORD_CHAR_CLASS_PATTERNS: Record<PasswordCharClass, RegExp> = {
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  digits: /[0-9]/,
  // Redmine's own class is "every printable ASCII that is not a letter or digit".
  special_chars: /[ -/:-@[-`{-~]/,
};

export const PASSWORD_CHAR_CLASS_LABELS: Record<PasswordCharClass, string> = {
  uppercase: "大文字",
  lowercase: "小文字",
  digits: "数字",
  special_chars: "記号",
};

export interface PasswordPolicy {
  minLength: number;
  requiredCharClasses: PasswordCharClass[];
}

/**
 * Values the password must not simply repeat — Redmine compares case-insensitively against
 * the login, both names and every one of the user's email addresses.
 */
export interface PasswordOwnerHints {
  login?: string;
  firstname?: string;
  lastname?: string;
  mails?: string[];
}

export type PasswordPolicyViolation =
  | { kind: "too_short"; minLength: number }
  | { kind: "missing_char_classes"; charClasses: PasswordCharClass[] }
  | { kind: "too_simple" };

/** Returns every violation (not just the first) so a form can tell the user all of them at once. */
export function checkPasswordPolicy(
  clearPassword: string,
  policy: PasswordPolicy,
  owner: PasswordOwnerHints = {},
): PasswordPolicyViolation[] {
  const violations: PasswordPolicyViolation[] = [];

  if (clearPassword.length < policy.minLength) {
    violations.push({ kind: "too_short", minLength: policy.minLength });
  }

  const missing = policy.requiredCharClasses.filter(
    (charClass) => !PASSWORD_CHAR_CLASS_PATTERNS[charClass].test(clearPassword),
  );
  if (missing.length > 0) {
    violations.push({ kind: "missing_char_classes", charClasses: missing });
  }

  const forbidden = [owner.login, owner.firstname, owner.lastname, ...(owner.mails ?? [])].filter(
    (value): value is string => Boolean(value),
  );
  if (forbidden.some((value) => value.toLowerCase() === clearPassword.toLowerCase())) {
    violations.push({ kind: "too_simple" });
  }

  return violations;
}

export function describePasswordPolicyViolation(violation: PasswordPolicyViolation): string {
  switch (violation.kind) {
    case "too_short":
      return `パスワードは${violation.minLength}文字以上で入力してください。`;
    case "missing_char_classes":
      return `パスワードには${violation.charClasses.map((c) => PASSWORD_CHAR_CLASS_LABELS[c]).join("・")}を含めてください。`;
    case "too_simple":
      return "パスワードにログインIDや氏名、メールアドレスは使用できません。";
  }
}

/** Convenience for use cases that only need to reject, not enumerate — returns null when the password is acceptable. */
export function describePasswordPolicyFailure(
  clearPassword: string,
  policy: PasswordPolicy,
  owner: PasswordOwnerHints = {},
): string | null {
  const violations = checkPasswordPolicy(clearPassword, policy, owner);
  return violations.length === 0 ? null : violations.map(describePasswordPolicyViolation).join(" ");
}
