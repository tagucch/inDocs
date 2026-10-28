import { createMiddleware } from "hono/factory";
import { findDeviceByToken, touchDevice } from "../db/devices";
import { type AppContext, isAllowedEmail } from "../env";

export const requireDevice = createMiddleware<AppContext>(async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return c.json({ error: "unauthorized", message: "端末トークンがありません。`indocs pair <code>` で登録してください" }, 401);
  }
  const device = await findDeviceByToken(c.env.DB, token);
  if (!device || !isAllowedEmail(c.env, device.user_email)) {
    return c.json({ error: "unauthorized", message: "端末トークンが無効です。`indocs pair <code>` で登録し直してください" }, 401);
  }
  c.set("device", { id: device.id, name: device.name, email: device.user_email });
  c.executionCtx.waitUntil(touchDevice(c.env.DB, device.id));
  await next();
});
