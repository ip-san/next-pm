import { describe, expect, it } from "bun:test";
import { isBlockedAddress, parseWebhookEndpoint } from "./endpoint";

describe("parseWebhookEndpoint", () => {
  it("accepts an ordinary https URL", () => {
    expect(parseWebhookEndpoint("https://hooks.example.com/incoming")).toEqual({
      ok: true,
      endpoint: { hostname: "hooks.example.com", port: 443, secure: true },
    });
  });

  it("defaults the port per scheme and keeps an explicit one", () => {
    expect(parseWebhookEndpoint("http://example.com/x")).toMatchObject({ endpoint: { port: 80, secure: false } });
    expect(parseWebhookEndpoint("https://example.com:8443/x")).toMatchObject({ endpoint: { port: 8443 } });
  });

  it("rejects a non-http scheme", () => {
    for (const url of ["file:///etc/passwd", "gopher://example.com", "ftp://example.com"]) {
      expect(parseWebhookEndpoint(url)).toEqual({ ok: false, reason: "unsupported_scheme" });
    }
  });

  it("rejects a bad port", () => {
    expect(parseWebhookEndpoint("http://example.com:22/x")).toEqual({ ok: false, reason: "blocked_port" });
    expect(parseWebhookEndpoint("http://example.com:25/x")).toEqual({ ok: false, reason: "blocked_port" });
  });

  it("rejects something that isn't a URL", () => {
    expect(parseWebhookEndpoint("not a url")).toEqual({ ok: false, reason: "invalid_url" });
  });
});

describe("isBlockedAddress", () => {
  it("blocks loopback, private, link-local, CGNAT and multicast IPv4", () => {
    for (const address of [
      "127.0.0.1",
      "127.1.2.3",
      "0.0.0.0",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isBlockedAddress(address)).toBe(true);
    }
  });

  it("allows ordinary public IPv4", () => {
    for (const address of ["8.8.8.8", "203.0.113.10", "172.32.0.1", "11.0.0.1"]) {
      expect(isBlockedAddress(address)).toBe(false);
    }
  });

  it("blocks loopback, unique-local, link-local and multicast IPv6", () => {
    for (const address of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1"]) {
      expect(isBlockedAddress(address)).toBe(true);
    }
  });

  it("blocks IPv4-mapped forms of a private address", () => {
    expect(isBlockedAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedAddress("::ffff:10.0.0.1")).toBe(true);
  });

  it("allows a public IPv6 address, including its mapped form", () => {
    expect(isBlockedAddress("2606:4700:4700::1111")).toBe(false);
    expect(isBlockedAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("fails closed on anything it cannot parse", () => {
    expect(isBlockedAddress("")).toBe(true);
    expect(isBlockedAddress("example.com")).toBe(true);
    expect(isBlockedAddress("1.2.3")).toBe(true);
  });
});
