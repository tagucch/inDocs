import { Hono } from "hono";
import { auth } from "./auth/routes";
import type { AppContext } from "./env";
import { baseHeaders } from "./middleware/headers";
import { device } from "./routes/device";
import { owner } from "./routes/owner";
import { view } from "./routes/view";

const app = new Hono<AppContext>();

app.use("*", baseHeaders);

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/auth", auth);
app.route("/api/owner", owner);
app.route("/api/device", device);
app.route("/view", view);

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal" }, 500);
});

export default app;
