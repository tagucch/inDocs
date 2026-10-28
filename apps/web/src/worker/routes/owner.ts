import { Hono } from "hono";
import type { AnswerBody, CreateRequestBody, PageStatePatch, PagesResponse, ProjectStatePatch } from "../../shared/types";
import { createPairing, listDevices, revokeDevice } from "../db/devices";
import { getPage, listPages } from "../db/pages";
import { listPageStates, listProjectStates, patchPageState, patchProjectState } from "../db/states";
import { answerTask, createRequest, deleteTask, listOwnerTasks, purgeExpiredTasks, toTask } from "../db/tasks";
import { getUser } from "../db/users";
import type { AppContext } from "../env";
import { rejectCrossOrigin, requireOwner } from "../middleware/owner";

export const owner = new Hono<AppContext>();

owner.use("*", rejectCrossOrigin, requireOwner);

owner.get("/me", (c) => c.json({ email: c.get("user").email }));

owner.get("/pages", async (c) => {
  const email = c.get("user").email;
  const [pages, pageStates, projectStates, user] = await Promise.all([
    listPages(c.env.DB),
    listPageStates(c.env.DB, email),
    listProjectStates(c.env.DB, email),
    getUser(c.env.DB, email),
  ]);
  const baseline = user?.first_seen_at ?? "";
  const stateBySlug = new Map(pageStates.map((s) => [s.slug, s]));
  const response: PagesResponse = {
    generatedAt: new Date().toISOString(),
    pages: pages.map((p) => {
      const state = stateBySlug.get(p.slug);
      const readVersion = state?.read_version ?? baseline;
      return {
        slug: p.slug,
        title: p.title,
        project: p.project,
        projectLabel: p.project_label,
        source: p.source,
        size: p.size,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        unread: p.updated_at > readVersion,
        starred: state?.starred === 1,
        hidden: state?.hidden === 1,
      };
    }),
    projects: projectStates.map((s) => ({ project: s.project, starred: s.starred === 1, pinned: s.pinned === 1 })),
  };
  return c.json(response);
});

owner.put("/pages/:slug/state", async (c) => {
  const slug = c.req.param("slug");
  const patch = await c.req.json<PageStatePatch>().catch(() => null);
  if (!patch || typeof patch !== "object") return c.json({ error: "bad_request" }, 400);
  const page = await getPage(c.env.DB, slug);
  if (!page) return c.json({ error: "not_found" }, 404);
  const state = await patchPageState(c.env.DB, c.get("user").email, slug, patch, page.updated_at);
  return c.json({
    slug,
    unread: page.updated_at > (state.read_version ?? ""),
    starred: state.starred === 1,
    hidden: state.hidden === 1,
  });
});

owner.put("/projects/:project/state", async (c) => {
  const project = c.req.param("project");
  const patch = await c.req.json<ProjectStatePatch>().catch(() => null);
  if (!patch || typeof patch !== "object" || !project) return c.json({ error: "bad_request" }, 400);
  const state = await patchProjectState(c.env.DB, c.get("user").email, project, patch);
  return c.json({ project, starred: state.starred === 1, pinned: state.pinned === 1 });
});

owner.post("/pairings", async (c) => {
  const pairing = await createPairing(c.env.DB, c.get("user").email);
  return c.json(pairing);
});

owner.get("/devices", async (c) => {
  const devices = await listDevices(c.env.DB, c.get("user").email);
  return c.json(devices.map((d) => ({ id: d.id, name: d.name, createdAt: d.created_at, lastUsedAt: d.last_used_at })));
});

owner.delete("/devices/:id", async (c) => {
  const ok = await revokeDevice(c.env.DB, c.get("user").email, c.req.param("id"));
  return ok ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
});

owner.get("/tasks", async (c) => {
  const rows = await listOwnerTasks(c.env.DB, c.get("user").email, c.req.query("all") === "1");
  c.executionCtx.waitUntil(purgeExpiredTasks(c.env.DB));
  return c.json({ tasks: rows.map(toTask) });
});

owner.post("/tasks", async (c) => {
  const body = await c.req.json<CreateRequestBody>().catch(() => null);
  const text = body?.body?.trim();
  if (!text) return c.json({ error: "bad_request", message: "依頼の本文を入力してください" }, 400);
  if (text.length > 4000) return c.json({ error: "too_long", message: "依頼は 4000 文字までです" }, 400);
  const target = body?.target?.trim().slice(0, 120) || null;
  const row = await createRequest(c.env.DB, c.get("user").email, text, target);
  return c.json(toTask(row), 201);
});

owner.post("/tasks/:id/answer", async (c) => {
  const body = await c.req.json<AnswerBody>().catch(() => null);
  if (!body || typeof body.approved !== "boolean") return c.json({ error: "bad_request" }, 400);
  const responseText = body.responseText?.trim().slice(0, 4000) || null;
  if (!body.approved && !responseText) {
    return c.json({ error: "bad_request", message: "承認しない場合はコメントを入力してください" }, 400);
  }
  const row = await answerTask(c.env.DB, c.get("user").email, c.req.param("id"), body.approved, responseText);
  if (!row) return c.json({ error: "not_waiting", message: "このカードはもう回答済みか、見つかりません" }, 409);
  return c.json(toTask(row));
});

owner.delete("/tasks/:id", async (c) => {
  const ok = await deleteTask(c.env.DB, c.get("user").email, c.req.param("id"));
  return ok ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
});
