import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

app.get("/healthz", (c) => c.json({ status: "ok" }));

export function startHealthServer(port = 3001) {
  serve({ fetch: app.fetch, port });
}
