import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { NodeWebhookSender } from "./webhook-sender";

/**
 * The point of these tests is the SSRF boundary, so the receiver deliberately lives on
 * loopback: every attempt to reach it must be refused *before* a request is written. A test
 * that proved delivery instead would have to bypass the very check being asserted.
 */
let server: Server;
let received = 0;
let port = 0;

beforeAll(async () => {
  server = createServer((_req, res) => {
    received += 1;
    res.writeHead(200).end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
});

afterAll(() => {
  server.close();
});

describe("NodeWebhookSender", () => {
  const sender = new NodeWebhookSender();

  it("refuses a loopback URL without opening a request", async () => {
    const result = await sender.send(`http://127.0.0.1:${port}/hook`, "{}", "");
    expect(result).toEqual({ ok: false, retryable: false, reason: "blocked_address" });
    expect(received).toBe(0);
  });

  it("refuses a hostname that resolves to loopback, so DNS can't be used to get around it", async () => {
    const result = await sender.send(`http://localhost:${port}/hook`, "{}", "");
    expect(result.ok).toBe(false);
    expect(received).toBe(0);
  });

  it("refuses the cloud metadata address", async () => {
    const result = await sender.send("http://169.254.169.254/latest/meta-data/", "{}", "");
    expect(result).toEqual({ ok: false, retryable: false, reason: "blocked_address" });
  });

  it("refuses a non-http scheme and a blocked port before any lookup", async () => {
    expect(await sender.send("file:///etc/passwd", "{}", "")).toEqual({
      ok: false,
      retryable: false,
      reason: "unsupported_scheme",
    });
    expect(await sender.send("http://example.com:22/x", "{}", "")).toEqual({
      ok: false,
      retryable: false,
      reason: "blocked_port",
    });
  });

  it("reports a blocked address as non-retryable so the job isn't re-queued forever", async () => {
    const result = await sender.send(`http://10.0.0.1/hook`, "{}", "");
    expect(result).toMatchObject({ ok: false, retryable: false });
  });
});
