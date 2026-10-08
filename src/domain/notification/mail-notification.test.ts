import { describe, expect, it } from "bun:test";
import { shouldNotifyRecipient, wantsMail } from "./mail-notification";

const base = { userId: "user-1", mailNotification: "all" as const, noSelfNotified: true };

describe("wantsMail", () => {
  it("is false only for 'none'", () => {
    expect(wantsMail("none")).toBe(false);
    expect(wantsMail("all")).toBe(true);
    expect(wantsMail("only_assigned")).toBe(true);
  });
});

describe("shouldNotifyRecipient", () => {
  it("notifies a recipient who is not the actor", () => {
    expect(shouldNotifyRecipient(base, "someone-else")).toBe(true);
  });

  it("drops the actor's own copy by default", () => {
    expect(shouldNotifyRecipient(base, "user-1")).toBe(false);
  });

  it("keeps the actor's own copy once they turn no_self_notified off", () => {
    expect(shouldNotifyRecipient({ ...base, noSelfNotified: false }, "user-1")).toBe(true);
  });

  it("drops a recipient who wants no mail at all, even when someone else acted", () => {
    expect(shouldNotifyRecipient({ ...base, mailNotification: "none" }, "someone-else")).toBe(false);
  });

  it("notifies everyone when there is no actor (a system-generated mail)", () => {
    expect(shouldNotifyRecipient(base, null)).toBe(true);
  });
});
