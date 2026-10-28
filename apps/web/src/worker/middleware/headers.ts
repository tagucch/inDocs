import { createMiddleware } from "hono/factory";
import type { AppContext } from "../env";

export const baseHeaders = createMiddleware<AppContext>(async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Robots-Tag", "noindex, nofollow, noarchive");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
  if (new URL(c.req.url).protocol === "https:") {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
});
