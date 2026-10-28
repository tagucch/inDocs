import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { deviceApi } from "../api.ts";
import { bundleHtml } from "../bundle.ts";
import { requireConfig } from "../config.ts";
import { extractTitle, shortHash, slugify } from "../html.ts";
import { formatWhen, info, printJson, warn } from "../output.ts";

const execFileAsync = promisify(execFile);

type DevicePage = {
  slug: string;
  title: string;
  project: string;
  projectLabel: string | null;
  source: string | null;
  updatedAt: string;
  size: number;
};

async function gitRoot(dir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", dir, "rev-parse", "--show-toplevel"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function tildify(file: string): string {
  const home = os.homedir();
  return file.startsWith(home) ? `~${file.slice(home.length)}` : file;
}

export async function add(
  file: string | undefined,
  opts: { title?: string; project?: string; slug?: string; label?: string; json?: boolean },
): Promise<void> {
  if (!file) throw new Error("登録する HTML ファイルを指定してください。例: indocs add report.html");
  const config = await requireConfig();
  const absolute = path.resolve(file);
  if (!/\.html?$/i.test(absolute)) throw new Error("拡張子が .html のファイルだけ登録できます");
  const raw = await readFile(absolute, "utf8");
  const { html, embedded, skipped } = await bundleHtml(raw, absolute);

  const title = opts.title?.trim() || extractTitle(html) || path.basename(absolute, path.extname(absolute));
  const base = path.basename(absolute, path.extname(absolute));
  const slug = opts.slug?.trim() || slugify(base) || slugify(title) || `page-${shortHash(absolute)}`;
  const root = await gitRoot(path.dirname(absolute));
  const project = opts.project?.trim() || path.basename(root ?? path.dirname(absolute));

  const api = deviceApi(config);
  const result = await api<{ slug: string; title: string; project: string; updatedAt: string; changed: boolean; url: string }>(
    "PUT",
    `/api/device/pages/${encodeURIComponent(slug)}`,
    { body: { html, title, project, projectLabel: opts.label, source: tildify(absolute) } },
  );

  if (opts.json) return printJson({ ...result, embedded, skipped });
  info(`${result.changed ? "登録しました" : "内容に変更がないので更新しませんでした"}: ${result.title}`);
  info(`  URL: ${result.url}`);
  info(`  プロジェクト: ${result.project} / slug: ${result.slug}`);
  if (embedded.length) info(`  埋め込んだファイル: ${embedded.join(", ")}`);
  for (const s of skipped) warn(`  埋め込めなかった参照: ${s.ref}（${s.reason}）`);
}

export async function list(opts: { json?: boolean }): Promise<void> {
  const config = await requireConfig();
  const { pages } = await deviceApi(config)<{ pages: DevicePage[] }>("GET", "/api/device/pages");
  if (opts.json) return printJson(pages);
  if (!pages.length) return info("登録されているページはありません。");
  for (const page of pages) {
    info(`${formatWhen(page.updatedAt)}  ${page.project} | ${page.title}  [${page.slug}]`);
  }
  info(`${pages.length} 件  ${config.baseUrl}`);
}

export async function remove(slug: string | undefined, opts: { json?: boolean }): Promise<void> {
  if (!slug) throw new Error("削除するページの slug を指定してください。`indocs list` で確認できます");
  const config = await requireConfig();
  await deviceApi(config)("DELETE", `/api/device/pages/${encodeURIComponent(slug)}`);
  if (opts.json) return printJson({ slug, removed: true });
  info(`削除しました: ${slug}`);
}

export async function whoami(opts: { json?: boolean }): Promise<void> {
  const config = await requireConfig();
  const me = await deviceApi(config)<{ deviceId: string; deviceName: string; email: string }>("GET", "/api/device/me");
  if (opts.json) return printJson({ ...me, baseUrl: config.baseUrl });
  info(`${me.deviceName} として ${me.email} の inDocs（${config.baseUrl}）に接続できています。`);
}
