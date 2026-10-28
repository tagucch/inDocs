import type { Config } from "./config.ts";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Json = Record<string, unknown> | unknown[];

export async function request<T>(
  baseUrl: string,
  method: string,
  pathname: string,
  options: { token?: string; body?: Json; query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const url = new URL(pathname, `${baseUrl}/`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (err) {
    throw new ApiError(0, "network", `${url.origin} に接続できません: ${(err as Error).message}`);
  }

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const body = (json ?? {}) as { error?: string; message?: string };
    const detail = body.message ?? body.error ?? text.slice(0, 200) ?? response.statusText;
    throw new ApiError(response.status, body.error ?? `http_${response.status}`, `${response.status}: ${detail}`);
  }
  return json as T;
}

export function deviceApi(config: Config) {
  return <T>(method: string, pathname: string, options: { body?: Json; query?: Record<string, string | undefined> } = {}) =>
    request<T>(config.baseUrl, method, pathname, { ...options, token: config.token });
}
