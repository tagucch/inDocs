import { Hono } from "hono";
import type { DevicePage, PairClaimRequest, PushReviewCard, PutPageRequest, PutPageResponse, TaskKind, TaskStatus } from "../../shared/types";
import { claimPairing } from "../db/devices";
import { SLUG_PATTERN, getPage, listPages, objectKey, softDeletePage, upsertPage } from "../db/pages";
import { completeTask, createReviewCards, listDeviceTasks, toTask } from "../db/tasks";
import { type AppContext, appOrigin } from "../env";
import { sha256Hex } from "../lib/crypto";
import { extractTitle } from "../lib/html";
import { requireDevice } from "../middleware/device";

const MAX_HTML_BYTES = 15 * 1024 * 1024;
const KINDS: TaskKind[] = ["request", "review"];
const STATUSES: TaskStatus[] = ["waiting", "answered", "completed"];

export const device = new Hono<AppContext>();

device.post("/pair", async (c) => {
  const body = await c.req.json<PairClaimRequest>().catch(() => null);
  const code = body?.code?.trim();
  const deviceName = body?.deviceName?.trim().slice(0, 80);
  if (!code || !deviceName) return c.json({ error: "bad_request", message: "code と deviceName が必要です" }, 400);
  const claimed = await claimPairing(c.env.DB, code, deviceName);
  if (!claimed) return c.json({ error: "invalid_code", message: "ペアリングコードが無効か期限切れです" }, 400);
  return c.json({
    token: claimed.token,
    deviceId: claimed.device.id,
    deviceName: claimed.device.name,
    email: claimed.device.user_email,
  });
});

device.use("*", requireDevice);

device.get("/me", (c) => {
  const d = c.get("device");
  return c.json({ deviceId: d.id, deviceName: d.name, email: d.email });
});

device.get("/pages", async (c) => {
  const pages = await listPages(c.env.DB);
  const response: DevicePage[] = pages.map((p) => ({
    slug: p.slug,
    title: p.title,
    project: p.project,
    projectLabel: p.project_label,
    source: p.source,
    updatedAt: p.updated_at,
    size: p.size,
  }));
  return c.json({ pages: response });
});

device.put("/pages/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!SLUG_PATTERN.test(slug)) {
    return c.json({ error: "invalid_slug", message: "slug は英小文字・数字・ハイフンで 120 文字までです" }, 400);
  }
  const body = await c.req.json<PutPageRequest>().catch(() => null);
  if (!body || typeof body.html !== "string" || !body.html.trim()) {
    return c.json({ error: "bad_request", message: "html が必要です" }, 400);
  }
  const bytes = new TextEncoder().encode(body.html);
  if (bytes.byteLength > MAX_HTML_BYTES) {
    return c.json({ error: "too_large", message: `HTML は ${MAX_HTML_BYTES / 1024 / 1024}MB までです` }, 413);
  }
  const title = (body.title?.trim() || extractTitle(body.html) || slug).slice(0, 200);
  const project = (body.project?.trim() || "general").slice(0, 80);
  const projectLabel = body.projectLabel?.trim().slice(0, 200) || null;
  const source = body.source?.trim().slice(0, 500) || null;
  const contentHash = await sha256Hex(body.html);

  const existing = await getPage(c.env.DB, slug);
  if (!existing || existing.deleted_at || existing.content_hash !== contentHash) {
    await c.env.PAGES.put(objectKey(slug), bytes, {
      httpMetadata: { contentType: "text/html; charset=utf-8" },
    });
  }
  const { page, changed } = await upsertPage(c.env.DB, {
    slug,
    title,
    project,
    projectLabel,
    source,
    deviceId: c.get("device").id,
    contentHash,
    size: bytes.byteLength,
  });
  const response: PutPageResponse = {
    slug,
    title: page.title,
    project: page.project,
    updatedAt: page.updated_at,
    changed,
    url: `${appOrigin(c.env, c.req.url)}/p/${slug}`,
  };
  return c.json(response);
});

device.delete("/pages/:slug", async (c) => {
  const slug = c.req.param("slug");
  const removed = await softDeletePage(c.env.DB, slug);
  if (!removed) return c.json({ error: "not_found" }, 404);
  await c.env.PAGES.delete(objectKey(slug));
  return c.json({ ok: true });
});

device.get("/tasks", async (c) => {
  const kind = c.req.query("kind") as TaskKind | undefined;
  const status = c.req.query("status") as TaskStatus | undefined;
  const rows = await listDeviceTasks(c.env.DB, c.get("device").email, {
    kind: kind && KINDS.includes(kind) ? kind : undefined,
    status: status && STATUSES.includes(status) ? status : undefined,
    sessionId: c.req.query("sessionId")?.trim() || undefined,
  });
  return c.json({ tasks: rows.map(toTask) });
});

device.post("/tasks", async (c) => {
  const body = await c.req.json<{ sessionId?: string; cards?: PushReviewCard[] }>().catch(() => null);
  const sessionId = body?.sessionId?.trim().slice(0, 200);
  const cards = Array.isArray(body?.cards) ? body.cards : [];
  if (!sessionId) return c.json({ error: "bad_request", message: "sessionId が必要です" }, 400);
  if (!cards.length || cards.length > 5) return c.json({ error: "bad_request", message: "cards は 1〜5 件にしてください" }, 400);
  const clean: PushReviewCard[] = [];
  for (const card of cards) {
    const title = typeof card?.title === "string" ? card.title.trim().slice(0, 200) : "";
    const question = typeof card?.question === "string" ? card.question.trim().slice(0, 4000) : "";
    if (!title || !question) return c.json({ error: "bad_request", message: "各カードに title と question が必要です" }, 400);
    clean.push({
      title,
      question,
      context: typeof card.context === "string" ? card.context.trim().slice(0, 4000) || undefined : undefined,
      recommendation: typeof card.recommendation === "string" ? card.recommendation.trim().slice(0, 2000) || undefined : undefined,
    });
  }
  const d = c.get("device");
  const rows = await createReviewCards(c.env.DB, d.email, d.id, sessionId, clean);
  return c.json({ tasks: rows.map(toTask) }, 201);
});

device.post("/tasks/:id/complete", async (c) => {
  const ok = await completeTask(c.env.DB, c.get("device").email, c.req.param("id"));
  return ok ? c.json({ ok: true }) : c.json({ error: "not_found", message: "その ID の依頼は見つからないか、完了済みです" }, 404);
});
