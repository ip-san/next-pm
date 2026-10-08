import { describe, expect, it } from "bun:test";
import { evaluateLoginGate, mustActivateTwofa } from "./login-gate";

const plain = { status: "active" as const, isAdmin: false, twofaScheme: null };
const admin = { ...plain, isAdmin: true };
const paired = { ...plain, twofaScheme: "totp" as const };

describe("mustActivateTwofa", () => {
  it("never demands setup from a user who already paired", () => {
    expect(mustActivateTwofa({ isAdmin: true, twofaScheme: "totp" }, "2")).toBe(false);
  });

  it("demands setup from everyone in mode 2 and from administrators only in mode 3", () => {
    expect(mustActivateTwofa(plain, "2")).toBe(true);
    expect(mustActivateTwofa(plain, "3")).toBe(false);
    expect(mustActivateTwofa(admin, "3")).toBe(true);
  });

  it("demands nothing in the disabled and optional modes", () => {
    expect(mustActivateTwofa(admin, "0")).toBe(false);
    expect(mustActivateTwofa(admin, "1")).toBe(false);
  });
});

describe("evaluateLoginGate", () => {
  it("refuses a non-active account before anything else, whatever the 2FA mode", () => {
    expect(evaluateLoginGate({ ...paired, status: "locked" }, "1")).toEqual({ kind: "inactive", status: "locked" });
    expect(evaluateLoginGate({ ...plain, status: "registered" }, "0")).toEqual({ kind: "inactive", status: "registered" });
  });

  it("refuses a non-active account even on a path that already cleared the second factor", () => {
    expect(evaluateLoginGate({ ...paired, status: "locked" }, "1", { skipTwofa: true })).toEqual({
      kind: "inactive",
      status: "locked",
    });
  });

  it("challenges a paired user", () => {
    expect(evaluateLoginGate(paired, "1")).toEqual({ kind: "twofa_required" });
  });

  it("does not challenge a paired user once the feature is switched off", () => {
    expect(evaluateLoginGate(paired, "0")).toEqual({ kind: "allowed" });
  });

  it("forces setup when the mode requires a factor the account lacks", () => {
    expect(evaluateLoginGate(plain, "2")).toEqual({ kind: "twofa_setup_required" });
    expect(evaluateLoginGate(admin, "3")).toEqual({ kind: "twofa_setup_required" });
    expect(evaluateLoginGate(plain, "3")).toEqual({ kind: "allowed" });
  });

  it("lets a just-verified second factor through without looping", () => {
    expect(evaluateLoginGate(paired, "1", { skipTwofa: true })).toEqual({ kind: "allowed" });
  });
});
