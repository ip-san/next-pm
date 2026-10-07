import { createHmac } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { computeWebhookSignature, WEBHOOK_SIGNATURE_HEADER } from "./signature";

describe("computeWebhookSignature", () => {
  it("matches the GitHub/Redmine sha256= hex HMAC of the exact body", () => {
    const body = '{"type":"issue.created"}';
    const expected = `sha256=${createHmac("sha256", "s3cret").update(body, "utf8").digest("hex")}`;
    expect(computeWebhookSignature("s3cret", body)).toBe(expected);
    expect(computeWebhookSignature("s3cret", body)).toStartWith("sha256=");
  });

  it("changes when the body or the secret changes", () => {
    const a = computeWebhookSignature("s3cret", "{}");
    expect(computeWebhookSignature("s3cret", "{ }")).not.toBe(a);
    expect(computeWebhookSignature("other", "{}")).not.toBe(a);
  });

  it("uses Redmine's header name so existing receivers verify unchanged", () => {
    expect(WEBHOOK_SIGNATURE_HEADER).toBe("x-redmine-signature-256");
  });
});
