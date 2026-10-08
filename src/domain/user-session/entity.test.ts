import { describe, expect, it } from "bun:test";
import { isSessionExpired, shouldTouchSession, type UserSession } from "./entity";

const NOW = new Date("2026-01-01T12:00:00Z");

function session(overrides: Partial<UserSession> = {}): UserSession {
  return {
    id: "session-1",
    userId: "user-1",
    createdAt: new Date("2026-01-01T11:00:00Z"),
    lastActiveAt: new Date("2026-01-01T11:59:00Z"),
    ...overrides,
  };
}

describe("isSessionExpired", () => {
  it("never expires when both limits are 0", () => {
    const old = session({ createdAt: new Date("2020-01-01T00:00:00Z"), lastActiveAt: new Date("2020-01-01T00:00:00Z") });
    expect(isSessionExpired(old, { lifetimeMinutes: 0, timeoutMinutes: 0 }, NOW)).toBe(false);
  });

  it("expires once the lifetime has elapsed since creation, however recent the activity", () => {
    const active = session({ createdAt: new Date("2026-01-01T09:00:00Z"), lastActiveAt: NOW });
    expect(isSessionExpired(active, { lifetimeMinutes: 120, timeoutMinutes: 0 }, NOW)).toBe(true);
    expect(isSessionExpired(active, { lifetimeMinutes: 240, timeoutMinutes: 0 }, NOW)).toBe(false);
  });

  it("expires once the idle timeout has elapsed since the last request, however new the session", () => {
    const idle = session({ createdAt: new Date("2026-01-01T11:00:00Z"), lastActiveAt: new Date("2026-01-01T11:00:00Z") });
    expect(isSessionExpired(idle, { lifetimeMinutes: 0, timeoutMinutes: 30 }, NOW)).toBe(true);
    expect(isSessionExpired(idle, { lifetimeMinutes: 0, timeoutMinutes: 90 }, NOW)).toBe(false);
  });
});

describe("shouldTouchSession", () => {
  it("skips the write within a minute of the last one", () => {
    expect(shouldTouchSession(session({ lastActiveAt: new Date("2026-01-01T11:59:30Z") }), NOW)).toBe(false);
  });

  it("writes once a minute has passed", () => {
    expect(shouldTouchSession(session({ lastActiveAt: new Date("2026-01-01T11:58:00Z") }), NOW)).toBe(true);
  });
});
