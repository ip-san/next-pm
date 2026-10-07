import { lookup as dnsLookupCallback } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { promisify } from "node:util";
import { isBlockedAddress, parseWebhookEndpoint } from "@/domain/webhook/endpoint";
import { computeWebhookSignature, WEBHOOK_SIGNATURE_HEADER } from "@/domain/webhook/signature";
import type { WebhookSender, WebhookDeliveryResult } from "@/domain/webhook/sender";

const dnsLookup = promisify(dnsLookupCallback);

/** Redmine opens the connection with open/read/write timeouts of 60s; the worker is a single
 * loop, so a hung receiver would stall notification mail behind it. 20s is the compromise. */
const TIMEOUT_MS = 20_000;

/**
 * Posts a webhook payload over node:http(s) rather than fetch, for two reasons that both come
 * down to SSRF:
 *
 * - `fetch` follows redirects, and a 302 to http://169.254.169.254/ would bypass every check
 *   made on the original URL. node:http never follows one, and a 3xx is reported as a failure.
 * - the hostname is resolved here, screened here, and the socket is then opened against the
 *   address that passed — the same thing Redmine's `Net::HTTP.start(..., ipaddr:)` does. A
 *   name that answers with a public address now and a private one a moment later (DNS
 *   rebinding) has no second resolution to exploit, because there isn't one.
 *
 * A URL whose host is already an IP literal never goes through DNS at all, so that case is
 * screened separately before anything else happens.
 */
export class NodeWebhookSender implements WebhookSender {
  async send(url: string, payload: string, secret: string): Promise<WebhookDeliveryResult> {
    const parsed = parseWebhookEndpoint(url);
    if (!parsed.ok) {
      return { ok: false, retryable: false, reason: parsed.reason };
    }
    const { hostname, port, secure } = parsed.endpoint;
    const host = hostname.replace(/^\[|\]$/g, "");

    let address: string;
    if (isIP(host) !== 0) {
      if (isBlockedAddress(host)) {
        return { ok: false, retryable: false, reason: "blocked_address" };
      }
      address = host;
    } else {
      let resolved: { address: string; family: number }[];
      try {
        resolved = await dnsLookup(host, { all: true });
      } catch (error) {
        return { ok: false, retryable: true, reason: `dns:${(error as Error).message}` };
      }
      const allowed = resolved.find((entry) => !isBlockedAddress(entry.address));
      if (!allowed) {
        return { ok: false, retryable: false, reason: "blocked_address" };
      }
      address = allowed.address;
    }

    const target = new URL(url);
    const headers: Record<string, string> = {
      accept: "*/*",
      "content-type": "application/json",
      "user-agent": "next-pm",
      // The socket goes to the screened address, so the virtual host has to be stated.
      host: target.host,
      "content-length": String(Buffer.byteLength(payload, "utf8")),
    };
    if (secret.length > 0) {
      headers[WEBHOOK_SIGNATURE_HEADER] = computeWebhookSignature(secret, payload);
    }

    const requestFn = secure ? httpsRequest : httpRequest;

    return new Promise<WebhookDeliveryResult>((resolve) => {
      let settled = false;
      const settle = (result: WebhookDeliveryResult) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };

      const req = requestFn(
        {
          host: address,
          port,
          path: target.pathname + target.search,
          method: "POST",
          headers,
          timeout: TIMEOUT_MS,
          // Certificates are issued to the name, not to the address we dialled.
          ...(secure ? { servername: host } : {}),
        },
        (res) => {
          // Drain so the socket can be closed; the body is not part of the contract.
          res.resume();
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) {
            settle({ ok: true, status });
          } else {
            // 3xx included: a redirect is never followed, so it counts as a failed delivery.
            settle({ ok: false, retryable: status >= 500, reason: `http_${status}`, status });
          }
        },
      );

      req.on("timeout", () => {
        req.destroy(new Error("timeout"));
      });
      req.on("error", (error) => {
        settle({ ok: false, retryable: true, reason: `network:${error.message}` });
      });
      req.end(payload);
    });
  }
}
