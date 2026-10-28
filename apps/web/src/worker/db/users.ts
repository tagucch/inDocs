import { nowIso } from "../lib/time";

export type UserRow = { email: string; first_seen_at: string; last_seen_at: string };

export async function touchUser(db: D1Database, email: string): Promise<void> {
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO users (email, first_seen_at, last_seen_at) VALUES (?1, ?2, ?2)
       ON CONFLICT(email) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    )
    .bind(email, now)
    .run();
}

export async function getUser(db: D1Database, email: string): Promise<UserRow | null> {
  return db.prepare(`SELECT email, first_seen_at, last_seen_at FROM users WHERE email = ?1`).bind(email).first<UserRow>();
}
