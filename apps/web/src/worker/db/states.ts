import type { PageStatePatch, ProjectStatePatch } from "../../shared/types";
import { nowIso } from "../lib/time";

export type PageStateRow = { slug: string; read_version: string | null; starred: number; hidden: number };
export type ProjectStateRow = { project: string; starred: number; pinned: number };

export async function listPageStates(db: D1Database, email: string): Promise<PageStateRow[]> {
  const { results } = await db
    .prepare(`SELECT slug, read_version, starred, hidden FROM page_states WHERE user_email = ?1`)
    .bind(email)
    .all<PageStateRow>();
  return results;
}

export async function patchPageState(
  db: D1Database,
  email: string,
  slug: string,
  patch: PageStatePatch,
  currentVersion: string,
): Promise<PageStateRow> {
  const current = await db
    .prepare(`SELECT slug, read_version, starred, hidden FROM page_states WHERE user_email = ?1 AND slug = ?2`)
    .bind(email, slug)
    .first<PageStateRow>();
  const next: PageStateRow = {
    slug,
    read_version: patch.read === undefined ? (current?.read_version ?? null) : patch.read ? currentVersion : "",
    starred: patch.starred === undefined ? (current?.starred ?? 0) : patch.starred ? 1 : 0,
    hidden: patch.hidden === undefined ? (current?.hidden ?? 0) : patch.hidden ? 1 : 0,
  };
  await db
    .prepare(
      `INSERT INTO page_states (user_email, slug, read_version, starred, hidden, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(user_email, slug) DO UPDATE SET
         read_version = excluded.read_version, starred = excluded.starred, hidden = excluded.hidden, updated_at = excluded.updated_at`,
    )
    .bind(email, slug, next.read_version, next.starred, next.hidden, nowIso())
    .run();
  return next;
}

export async function listProjectStates(db: D1Database, email: string): Promise<ProjectStateRow[]> {
  const { results } = await db
    .prepare(`SELECT project, starred, pinned FROM project_states WHERE user_email = ?1`)
    .bind(email)
    .all<ProjectStateRow>();
  return results;
}

export async function patchProjectState(
  db: D1Database,
  email: string,
  project: string,
  patch: ProjectStatePatch,
): Promise<ProjectStateRow> {
  const current = await db
    .prepare(`SELECT project, starred, pinned FROM project_states WHERE user_email = ?1 AND project = ?2`)
    .bind(email, project)
    .first<ProjectStateRow>();
  const next: ProjectStateRow = {
    project,
    starred: patch.starred === undefined ? (current?.starred ?? 0) : patch.starred ? 1 : 0,
    pinned: patch.pinned === undefined ? (current?.pinned ?? 0) : patch.pinned ? 1 : 0,
  };
  await db
    .prepare(
      `INSERT INTO project_states (user_email, project, starred, pinned, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(user_email, project) DO UPDATE SET
         starred = excluded.starred, pinned = excluded.pinned, updated_at = excluded.updated_at`,
    )
    .bind(email, project, next.starred, next.pinned, nowIso())
    .run();
  return next;
}
