import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppContext } from "../env";
import { openJson, sealJson } from "./crypto";

export const SESSION_COOKIE = "indocs_session";
const SESSION_DAYS = 30;

export type Session = { email: string; iat: number; exp: number };

export function isSecureRequest(c: Context): boolean {
  return new URL(c.req.url).protocol === "https:";
}

export async function issueSession(c: Context<AppContext>, email: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const session: Session = { email, iat: now, exp: now + SESSION_DAYS * 86400 };
  setCookie(c, SESSION_COOKIE, await sealJson(c.env.SESSION_SECRET, session), {
    path: "/",
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: "Lax",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function readSession(c: Context<AppContext>): Promise<Session | null> {
  const session = await openJson<Session>(c.env.SESSION_SECRET, getCookie(c, SESSION_COOKIE));
  if (!session || typeof session.email !== "string" || session.exp * 1000 < Date.now()) return null;
  return session;
}

export function clearSession(c: Context<AppContext>): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}
