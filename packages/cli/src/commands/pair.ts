import os from "node:os";
import { request } from "../api.ts";
import { loadConfig, normalizeBaseUrl, saveConfig } from "../config.ts";
import { info, printJson } from "../output.ts";

export async function pair(code: string | undefined, opts: { name?: string; url?: string; json?: boolean }): Promise<void> {
  if (!code) throw new Error("ペアリングコードを指定してください。例: indocs pair ABCD-EFGH --url https://indocs.example.workers.dev");
  const existing = await loadConfig();
  const candidate = opts.url ?? process.env.INDOCS_URL ?? existing?.baseUrl;
  if (!candidate) throw new Error("inDocs の URL を --url で指定してください（ブラウザで開いている URL のオリジン）");
  const baseUrl = normalizeBaseUrl(candidate);
  const deviceName = opts.name?.trim() || os.hostname().replace(/\.local$/, "");
  const result = await request<{ token: string; deviceId: string; deviceName: string; email: string }>(
    baseUrl,
    "POST",
    "/api/device/pair",
    { body: { code, deviceName } },
  );
  await saveConfig({ baseUrl, token: result.token, deviceId: result.deviceId, deviceName: result.deviceName, email: result.email });
  if (opts.json) return printJson({ baseUrl, deviceId: result.deviceId, deviceName: result.deviceName, email: result.email });
  info(`この PC「${result.deviceName}」を ${result.email} の inDocs（${baseUrl}）に登録しました。`);
}
