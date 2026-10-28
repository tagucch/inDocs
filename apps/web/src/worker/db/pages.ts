import { nowIso } from "../lib/time";

export type PageRow = {
  slug: string;
  title: string;
  project: string;
  project_label: string | null;
  source: string | null;
  device_id: string | null;
  content_hash: string;
  size: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type UpsertPageInput = {
  slug: string;
  title: string;
  project: string;
  projectLabel: string | null;
  source: string | null;
  deviceId: string;
  contentHash: string;
  size: number;
};

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;

export function objectKey(slug: string): string {
  return `pages/${slug}.html`;
}

export async function getPage(db: D1Database, slug: string): Promise<PageRow | null> {
  return db.prepare(`SELECT * FROM pages WHERE slug = ?1`).bind(slug).first<PageRow>();
}

export async function upsertPage(db: D1Database, input: UpsertPageInput): Promise<{ page: PageRow; changed: boolean }> {
  const existing = await getPage(db, input.slug);
  const now = nowIso();
  const unchanged = !!existing && !existing.deleted_at && existing.content_hash === input.contentHash;
  const updatedAt = unchanged ? existing.updated_at : now;
  await db
    .prepare(
      `INSERT INTO pages (slug, title, project, project_label, source, device_id, content_hash, size, created_at, updated_at, deleted_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL)
       ON CONFLICT(slug) DO UPDATE SET
         title = excluded.title,
         project = excluded.project,
         project_label = excluded.project_label,
         source = excluded.source,
         device_id = excluded.device_id,
         content_hash = excluded.content_hash,
         size = excluded.size,
         updated_at = excluded.updated_at,
         deleted_at = NULL`,
    )
    .bind(
      input.slug,
      input.title,
      input.project,
      input.projectLabel,
      input.source,
      input.deviceId,
      input.contentHash,
      input.size,
      existing?.created_at ?? now,
      updatedAt,
    )
    .run();
  const page = await getPage(db, input.slug);
  if (!page) throw new Error(`page ${input.slug} vanished after upsert`);
  return { page, changed: !unchanged };
}

export async function listPages(db: D1Database): Promise<PageRow[]> {
  const { results } = await db.prepare(`SELECT * FROM pages WHERE deleted_at IS NULL ORDER BY updated_at DESC`).all<PageRow>();
  return results;
}

export async function softDeletePage(db: D1Database, slug: string): Promise<boolean> {
  const result = await db
    .prepare(`UPDATE pages SET deleted_at = ?2 WHERE slug = ?1 AND deleted_at IS NULL`)
    .bind(slug, nowIso())
    .run();
  return (result.meta.changes ?? 0) > 0;
}
