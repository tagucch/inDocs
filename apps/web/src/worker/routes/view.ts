import { Hono } from "hono";
import mobileTables from "../assets/mobile-tables.js?raw";
import { SLUG_PATTERN, getPage, objectKey } from "../db/pages";
import { type AppContext, isAllowedEmail } from "../env";
import { readSession } from "../lib/session";

export const VIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' https: data: blob:",
  "style-src 'unsafe-inline' https: data:",
  "img-src data: https: blob:",
  "font-src data: https:",
  "media-src data: https: blob:",
  "connect-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation",
].join("; ");

export const view = new Hono<AppContext>();

const injected = `<script>${mobileTables}</script>`;

view.get("/:slug", async (c) => {
  const session = await readSession(c);
  if (!session || !isAllowedEmail(c.env, session.email)) {
    const path = new URL(c.req.url).pathname;
    return c.redirect(`/auth/login?return=${encodeURIComponent(path)}`);
  }
  const slug = c.req.param("slug");
  if (!SLUG_PATTERN.test(slug)) return c.text("このページは見つかりません", 404);
  const page = await getPage(c.env.DB, slug);
  if (!page || page.deleted_at) return c.text("このページは見つかりません", 404);
  const object = await c.env.PAGES.get(objectKey(slug));
  if (!object) return c.text("このページの本体が見つかりません", 404);

  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": VIEW_CSP,
    "cache-control": "private, no-store",
  });
  const response = new Response(object.body, { headers });
  return new HTMLRewriter()
    .on("body", {
      element(el) {
        el.append(injected, { html: true });
      },
    })
    .transform(response);
});
