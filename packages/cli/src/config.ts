import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type Config = {
  baseUrl: string;
  token: string;
  deviceId?: string;
  deviceName?: string;
  email?: string;
};

export function configDir(): string {
  return process.env.INDOCS_CONFIG_DIR ?? path.join(os.homedir(), ".config", "indocs");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

export async function loadConfig(): Promise<Config | null> {
  try {
    const raw = await readFile(configPath(), "utf8");
    const json = JSON.parse(raw) as Partial<Config>;
    if (!json.baseUrl || !json.token) return null;
    return json as Config;
  } catch {
    return null;
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  await writeFile(configPath(), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(configPath(), 0o600);
}

export function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(trimmed)) throw new Error(`URL は http(s):// から始めてください: ${url}`);
  return trimmed;
}

export function resolveBaseUrl(explicit: string | undefined, config: Config | null): string {
  const candidate = explicit ?? process.env.INDOCS_URL ?? config?.baseUrl;
  if (!candidate) {
    throw new Error("inDocs の URL が分かりません。--url か INDOCS_URL を指定するか、先に `indocs pair` を実行してください");
  }
  return normalizeBaseUrl(candidate);
}

export function configFromEnv(): Config | null {
  const token = process.env.INDOCS_TOKEN?.trim();
  if (!token) return null;
  const url = process.env.INDOCS_URL;
  if (!url) throw new Error("INDOCS_TOKEN を使うときは INDOCS_URL に inDocs の URL も指定してください");
  return { baseUrl: normalizeBaseUrl(url), token };
}

export async function requireConfig(): Promise<Config> {
  const fromEnv = configFromEnv();
  if (fromEnv) return fromEnv;
  const config = await loadConfig();
  if (!config) {
    throw new Error(
      "この PC はまだ登録されていません。inDocs の設定画面でコードを発行し、`indocs pair <code> --url <inDocs の URL>` を実行してください。config.json を置けない環境では INDOCS_TOKEN と INDOCS_URL を環境変数で渡せます",
    );
  }
  if (process.env.INDOCS_URL) config.baseUrl = normalizeBaseUrl(process.env.INDOCS_URL);
  return config;
}
