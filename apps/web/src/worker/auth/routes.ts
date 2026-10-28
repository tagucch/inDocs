import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { touchUser } from "../db/users";
import { type AppContext, appOrigin, isAllowedEmail, isLocalRequest } from "../env";
import { openJson, randomToken, sealJson } from "../lib/crypto";
import { clearSession, isSecureRequest, issueSession, readSession } from "../lib/session";
import { authorizeUrl, exchangeCode, pkceChallenge, verifyIdToken } from "./google";

const OAUTH_COOKIE = "indocs_oauth";
const OAUTH_TTL_SECONDS = 600;

type PendingLogin = { state: string; nonce: string; verifier: string; returnTo: string; exp: number };

export const auth = new Hono<AppContext>();

function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

function loginFailed(c: Context<AppContext>, status: 400 | 403 | 500, message: string) {
  return c.html(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ログインできません - inDocs</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;background:#f4f6fb;color:#1c2540;display:grid;place-items:center;min-height:100vh;margin:0}main{background:#fff;padding:32px;border-radius:16px;box-shadow:0 8px 30px rgba(11,61,145,.12);max-width:420px;width:calc(100% - 32px)}h1{font-size:18px;margin:0 0 12px}p{line-height:1.7;margin:0 0 20px}a{display:inline-block;background:#0b3d91;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600}</style></head>
<body><main><h1>ログインできません</h1><p>${escapeHtml(message)}</p><a href="/auth/login">もう一度ログインする</a></main></body></html>`,
    status,
  );
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

auth.get("/login", async (c) => {
  const returnTo = safeReturnTo(c.req.query("return"));
  const pending: PendingLogin = {
    state: randomToken(16),
    nonce: randomToken(16),
    verifier: randomToken(32),
    returnTo,
    exp: Math.floor(Date.now() / 1000) + OAUTH_TTL_SECONDS,
  };
  setCookie(c, OAUTH_COOKIE, await sealJson(c.env.SESSION_SECRET, pending), {
    path: "/auth",
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: "Lax",
    maxAge: OAUTH_TTL_SECONDS,
  });
  return c.redirect(
    authorizeUrl({
      clientId: c.env.GOOGLE_CLIENT_ID,
      redirectUri: `${appOrigin(c.env, c.req.url)}/auth/callback`,
      state: pending.state,
      nonce: pending.nonce,
      codeChallenge: await pkceChallenge(pending.verifier),
    }),
  );
});

auth.get("/callback", async (c) => {
  const pending = await openJson<PendingLogin>(c.env.SESSION_SECRET, getCookie(c, OAUTH_COOKIE));
  deleteCookie(c, OAUTH_COOKIE, { path: "/auth" });

  const oauthError = c.req.query("error");
  if (oauthError) return loginFailed(c, 400, `Google のログインが中断されました（${oauthError}）。`);

  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!pending || !code || !state || pending.state !== state || pending.exp * 1000 < Date.now()) {
    return loginFailed(c, 400, "ログインの有効期限が切れたか、手順が途中で途切れました。");
  }

  let identity;
  try {
    const { idToken } = await exchangeCode({
      clientId: c.env.GOOGLE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      redirectUri: `${appOrigin(c.env, c.req.url)}/auth/callback`,
      code,
      codeVerifier: pending.verifier,
    });
    identity = await verifyIdToken(idToken, c.env.GOOGLE_CLIENT_ID, pending.nonce);
  } catch (err) {
    console.error("google login failed", err);
    return loginFailed(c, 500, "Google との通信に失敗しました。時間をおいてもう一度お試しください。");
  }

  if (!identity.emailVerified || !isAllowedEmail(c.env, identity.email)) {
    console.warn("login rejected", identity.email);
    return loginFailed(c, 403, `${identity.email} はこのサイトの利用を許可されていません。`);
  }

  await touchUser(c.env.DB, identity.email.toLowerCase());
  await issueSession(c, identity.email.toLowerCase());
  return c.redirect(pending.returnTo);
});

auth.post("/logout", (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

auth.get("/me", async (c) => {
  const session = await readSession(c);
  if (!session || !isAllowedEmail(c.env, session.email)) return c.json({ error: "unauthorized" }, 401);
  return c.json({ email: session.email });
});

auth.get("/dev-login", async (c) => {
  const email = c.env.DEV_LOGIN_EMAIL?.trim().toLowerCase();
  if (!email || !isLocalRequest(c.req.url)) return c.text("Not Found", 404);
  if (!isAllowedEmail(c.env, email)) return loginFailed(c, 403, `DEV_LOGIN_EMAIL の ${email} が ALLOWED_EMAILS に含まれていません。`);
  await touchUser(c.env.DB, email);
  await issueSession(c, email);
  return c.redirect(safeReturnTo(c.req.query("return")));
});
