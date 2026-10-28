import { normalizePairingCode, pairingCode, randomToken, sha256Hex } from "../lib/crypto";
import { MINUTE, isoAfter, nowIso } from "../lib/time";

export type DeviceRow = {
  id: string;
  token_hash: string;
  name: string;
  user_email: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

const PAIRING_TTL = 10 * MINUTE;

export async function createPairing(db: D1Database, email: string): Promise<{ code: string; expiresAt: string }> {
  const code = pairingCode();
  const expiresAt = isoAfter(PAIRING_TTL);
  await db
    .prepare(`INSERT INTO pairings (code_hash, user_email, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)`)
    .bind(await sha256Hex(code), email, nowIso(), expiresAt)
    .run();
  return { code, expiresAt };
}

export async function claimPairing(
  db: D1Database,
  code: string,
  deviceName: string,
): Promise<{ token: string; device: DeviceRow } | null> {
  const codeHash = await sha256Hex(normalizePairingCode(code));
  const now = nowIso();
  const claimed = await db
    .prepare(`UPDATE pairings SET claimed_at = ?2 WHERE code_hash = ?1 AND claimed_at IS NULL AND expires_at > ?2`)
    .bind(codeHash, now)
    .run();
  if ((claimed.meta.changes ?? 0) === 0) return null;
  const pairing = await db
    .prepare(`SELECT user_email FROM pairings WHERE code_hash = ?1`)
    .bind(codeHash)
    .first<{ user_email: string }>();
  if (!pairing) return null;

  const token = randomToken(32);
  const device: DeviceRow = {
    id: crypto.randomUUID(),
    token_hash: await sha256Hex(token),
    name: deviceName,
    user_email: pairing.user_email,
    created_at: now,
    last_used_at: null,
    revoked_at: null,
  };
  await db
    .prepare(`INSERT INTO devices (id, token_hash, name, user_email, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`)
    .bind(device.id, device.token_hash, device.name, device.user_email, device.created_at)
    .run();
  return { token, device };
}

export async function findDeviceByToken(db: D1Database, token: string): Promise<DeviceRow | null> {
  return db
    .prepare(`SELECT * FROM devices WHERE token_hash = ?1 AND revoked_at IS NULL`)
    .bind(await sha256Hex(token))
    .first<DeviceRow>();
}

export async function touchDevice(db: D1Database, id: string): Promise<void> {
  await db.prepare(`UPDATE devices SET last_used_at = ?2 WHERE id = ?1`).bind(id, nowIso()).run();
}

export async function listDevices(db: D1Database, email: string): Promise<DeviceRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM devices WHERE user_email = ?1 AND revoked_at IS NULL ORDER BY created_at DESC`)
    .bind(email)
    .all<DeviceRow>();
  return results;
}

export async function revokeDevice(db: D1Database, email: string, id: string): Promise<boolean> {
  const result = await db
    .prepare(`UPDATE devices SET revoked_at = ?3 WHERE id = ?1 AND user_email = ?2 AND revoked_at IS NULL`)
    .bind(id, email, nowIso())
    .run();
  return (result.meta.changes ?? 0) > 0;
}
