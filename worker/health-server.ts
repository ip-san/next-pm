import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

app.get("/healthz", (c) => c.json({ status: "ok" }));

// serve()'s server emits bind failures as an async "error" event, not a throw — left unhandled it would crash the whole worker.
export function startHealthServer(port = 3001) {
  const server = serve({ fetch: app.fetch, port });
  server.on("error", (error) => {
    console.error(`[worker] health check server failed to start on port ${port} — continuing without it:`, error);
  });
  return server;
}
