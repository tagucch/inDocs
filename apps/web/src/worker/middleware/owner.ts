import { createMiddleware } from "hono/factory";
import { type AppContext, isAllowedEmail } from "../env";
import { readSession } from "../lib/session";

export const requireOwner = createMiddleware<AppContext>(async (c, next) => {
  const session = await readSession(c);
  if (!session || !isAllowedEmail(c.env, session.email)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("user", { email: session.email });
  await next();
});

export const rejectCrossOrigin = createMiddleware<AppContext>(async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const origin = c.req.header("origin");
    const expected = new URL(c.req.url).origin;
    if (origin && origin !== expected) return c.json({ error: "forbidden" }, 403);
  }
  await next();
});
