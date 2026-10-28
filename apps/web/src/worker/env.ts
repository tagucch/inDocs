export type AppEnv = Env & {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ALLOWED_EMAILS: string;
  SESSION_SECRET: string;
  APP_ORIGIN?: string;
  DEV_LOGIN_EMAIL?: string;
};

export type DeviceIdentity = {
  id: string;
  name: string;
  email: string;
};

export type Variables = {
  user: { email: string };
  device: DeviceIdentity;
};

export type AppContext = { Bindings: AppEnv; Variables: Variables };

export function allowedEmails(env: AppEnv): string[] {
  return (env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(env: AppEnv, email: string | undefined): email is string {
  if (!email) return false;
  return allowedEmails(env).includes(email.trim().toLowerCase());
}

export function appOrigin(env: AppEnv, requestUrl: string): string {
  if (env.APP_ORIGIN) return env.APP_ORIGIN.replace(/\/$/, "");
  return new URL(requestUrl).origin;
}

export function isLocalRequest(requestUrl: string): boolean {
  const host = new URL(requestUrl).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
}
