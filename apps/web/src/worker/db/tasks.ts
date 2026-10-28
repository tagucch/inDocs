import type { PushReviewCard, Task, TaskKind, TaskStatus } from "../../shared/types";
import { DAY, isoAfter, nowIso } from "../lib/time";

export type TaskRow = {
  id: string;
  kind: TaskKind;
  user_email: string;
  device_id: string | null;
  session_id: string | null;
  title: string | null;
  body: string;
  target: string | null;
  context: string | null;
  recommendation: string | null;
  status: TaskStatus;
  approved: number | null;
  response_text: string | null;
  created_at: string;
  updated_at: string;
  answered_at: string | null;
  completed_at: string | null;
  expires_at: string;
  device_name: string | null;
};

const REQUEST_TTL = 90 * DAY;
const REVIEW_TTL = 30 * DAY;
const SELECT = `SELECT t.*, d.name AS device_name FROM tasks t LEFT JOIN devices d ON d.id = t.device_id`;

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    kind: row.kind,
    sessionId: row.session_id,
    deviceId: row.device_id,
    deviceName: row.device_name ?? null,
    title: row.title,
    body: row.body,
    target: row.target,
    context: row.context,
    recommendation: row.recommendation,
    status: row.status,
    approved: row.approved === null ? null : row.approved === 1,
    responseText: row.response_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    answeredAt: row.answered_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
  };
}

export async function getTask(db: D1Database, email: string, id: string): Promise<TaskRow | null> {
  return db.prepare(`${SELECT} WHERE t.id = ?1 AND t.user_email = ?2`).bind(id, email).first<TaskRow>();
}

export async function createRequest(db: D1Database, email: string, body: string, target: string | null): Promise<TaskRow> {
  const id = crypto.randomUUID();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO tasks (id, kind, user_email, session_id, body, target, status, created_at, updated_at, expires_at)
       VALUES (?1, 'request', ?2, 'inbox', ?3, ?4, 'waiting', ?5, ?5, ?6)`,
    )
    .bind(id, email, body, target, now, isoAfter(REQUEST_TTL))
    .run();
  const row = await getTask(db, email, id);
  if (!row) throw new Error("request vanished after insert");
  return row;
}

export async function createReviewCards(
  db: D1Database,
  email: string,
  deviceId: string,
  sessionId: string,
  cards: PushReviewCard[],
): Promise<TaskRow[]> {
  const now = nowIso();
  const expiresAt = isoAfter(REVIEW_TTL);
  const ids = cards.map(() => crypto.randomUUID());
  await db.batch(
    cards.map((card, i) =>
      db
        .prepare(
          `INSERT INTO tasks (id, kind, user_email, device_id, session_id, title, body, context, recommendation, status, created_at, updated_at, expires_at)
           VALUES (?1, 'review', ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'waiting', ?9, ?9, ?10)`,
        )
        .bind(ids[i], email, deviceId, sessionId, card.title, card.question, card.context ?? null, card.recommendation ?? null, now, expiresAt),
    ),
  );
  const placeholders = ids.map((_, i) => `?${i + 2}`).join(", ");
  const { results } = await db
    .prepare(`${SELECT} WHERE t.user_email = ?1 AND t.id IN (${placeholders}) ORDER BY t.created_at ASC, t.rowid ASC`)
    .bind(email, ...ids)
    .all<TaskRow>();
  return results;
}

export async function listOwnerTasks(db: D1Database, email: string, includeCompleted: boolean): Promise<TaskRow[]> {
  const extra = includeCompleted ? "" : "AND t.status != 'completed'";
  const { results } = await db
    .prepare(`${SELECT} WHERE t.user_email = ?1 AND t.expires_at > ?2 ${extra} ORDER BY t.created_at DESC LIMIT 200`)
    .bind(email, nowIso())
    .all<TaskRow>();
  return results;
}

export async function listDeviceTasks(
  db: D1Database,
  email: string,
  filter: { kind?: TaskKind; status?: TaskStatus; sessionId?: string },
): Promise<TaskRow[]> {
  const clauses = ["t.user_email = ?1", "t.expires_at > ?2"];
  const binds: unknown[] = [email, nowIso()];
  if (filter.kind) {
    binds.push(filter.kind);
    clauses.push(`t.kind = ?${binds.length}`);
  }
  if (filter.status) {
    binds.push(filter.status);
    clauses.push(`t.status = ?${binds.length}`);
  }
  if (filter.sessionId) {
    binds.push(filter.sessionId);
    clauses.push(`t.session_id = ?${binds.length}`);
  }
  const { results } = await db
    .prepare(`${SELECT} WHERE ${clauses.join(" AND ")} ORDER BY t.created_at ASC LIMIT 200`)
    .bind(...binds)
    .all<TaskRow>();
  return results;
}

export async function answerTask(
  db: D1Database,
  email: string,
  id: string,
  approved: boolean,
  responseText: string | null,
): Promise<TaskRow | null> {
  const now = nowIso();
  const result = await db
    .prepare(
      `UPDATE tasks SET status = 'answered', approved = ?3, response_text = ?4, answered_at = ?5, updated_at = ?5
       WHERE id = ?1 AND user_email = ?2 AND kind = 'review' AND status = 'waiting'`,
    )
    .bind(id, email, approved ? 1 : 0, responseText, now)
    .run();
  if ((result.meta.changes ?? 0) === 0) return null;
  return getTask(db, email, id);
}

export async function completeTask(db: D1Database, email: string, id: string): Promise<boolean> {
  const now = nowIso();
  const result = await db
    .prepare(`UPDATE tasks SET status = 'completed', completed_at = ?3, updated_at = ?3 WHERE id = ?1 AND user_email = ?2 AND status != 'completed'`)
    .bind(id, email, now)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function deleteTask(db: D1Database, email: string, id: string): Promise<boolean> {
  const result = await db.prepare(`DELETE FROM tasks WHERE id = ?1 AND user_email = ?2`).bind(id, email).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function purgeExpiredTasks(db: D1Database): Promise<void> {
  await db.prepare(`DELETE FROM tasks WHERE expires_at <= ?1`).bind(nowIso()).run();
}
