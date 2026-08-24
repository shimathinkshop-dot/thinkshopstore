import app from "../../worker.js";

export async function onRequest(context) {
  // Cloudflare Pages Functions provides the same request/env objects
  // expected by the Worker implementation.
  return app.fetch(context.request, context.env, context);
}
