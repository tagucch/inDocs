import { readFile } from "node:fs/promises";
import { deviceApi } from "../api.ts";
import { requireConfig } from "../config.ts";
import { formatWhen, info, printJson, warn } from "../output.ts";

export type Task = {
  id: string;
  kind: "request" | "review";
  sessionId: string | null;
  title: string | null;
  body: string;
  target: string | null;
  context: string | null;
  recommendation: string | null;
  status: "waiting" | "answered" | "completed";
  approved: boolean | null;
  responseText: string | null;
  createdAt: string;
  answeredAt: string | null;
};

type Card = { title: string; question: string; context?: string; recommendation?: string };

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function inbox(opts: { json?: boolean }): Promise<void> {
  const config = await requireConfig();
  const { tasks } = await deviceApi(config)<{ tasks: Task[] }>("GET", "/api/device/tasks", {
    query: { kind: "request", status: "waiting" },
  });
  if (opts.json) return printJson({ requests: tasks });
  if (!tasks.length) return info("インボックスに未処理の依頼はありません。");
  for (const task of tasks) {
    info(`[${task.id}] ${formatWhen(task.createdAt)}${task.target ? `  宛先: ${task.target}` : ""}`);
    info(`  ${task.body.replace(/\n/g, "\n  ")}`);
  }
  info(`${tasks.length} 件。引き取ったら \`indocs complete <id...>\` で完了にしてください。`);
}

export async function complete(ids: string[], opts: { json?: boolean }): Promise<void> {
  if (!ids.length) throw new Error("完了にする依頼の ID を指定してください");
  const config = await requireConfig();
  const api = deviceApi(config);
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const id of ids) {
    try {
      await api("POST", `/api/device/tasks/${encodeURIComponent(id)}/complete`);
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: (err as Error).message });
    }
  }
  if (opts.json) return printJson(results);
  for (const r of results) {
    if (r.ok) info(`完了にしました: ${r.id}`);
    else warn(`完了にできませんでした: ${r.id}（${r.error}）`);
  }
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

function requireSession(session: string | undefined): string {
  if (!session?.trim()) throw new Error("--session <id> を指定してください（例: claude-<セッションID>）");
  return session.trim();
}

export async function reviewPush(opts: { session?: string; file?: string; json?: boolean }): Promise<void> {
  const session = requireSession(opts.session);
  const config = await requireConfig();
  const raw = opts.file ? await readFile(opts.file, "utf8") : await readStdin();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("カードの JSON を標準入力か --file で渡してください");
  }
  const cards = (Array.isArray(parsed) ? parsed : [parsed]) as Card[];
  if (!cards.length || cards.length > 5) throw new Error("カードは 1〜5 枚にしてください");
  for (const card of cards) {
    if (!card?.title?.trim() || !card?.question?.trim()) throw new Error("各カードに title と question が必要です");
  }
  const { tasks } = await deviceApi(config)<{ tasks: Task[] }>("POST", "/api/device/tasks", {
    body: { sessionId: session, cards },
  });
  if (opts.json) return printJson({ cards: tasks });
  for (const task of tasks) info(`送りました: [${task.id}] ${task.title}`);
  info(`スマホの inDocs「インボックス」に ${tasks.length} 件の確認カードを置きました。`);
}

export async function reviewPull(opts: { session?: string; json?: boolean }): Promise<void> {
  const session = requireSession(opts.session);
  const config = await requireConfig();
  const { tasks } = await deviceApi(config)<{ tasks: Task[] }>("GET", "/api/device/tasks", {
    query: { kind: "review", status: "answered", sessionId: session },
  });
  if (opts.json) return printJson({ answered: tasks });
  if (!tasks.length) return info("回答済みのカードはありません。");
  for (const task of tasks) {
    info(`[${task.id}] ${task.title}  → ${task.approved ? "承認" : "コメント"}${task.responseText ? `: ${task.responseText}` : ""}`);
  }
}

export async function reviewWatch(opts: { session?: string; "timeout-minutes"?: string; json?: boolean }): Promise<void> {
  const session = requireSession(opts.session);
  const config = await requireConfig();
  const timeoutMinutes = Number(opts["timeout-minutes"] ?? "240");
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) throw new Error("--timeout-minutes は正の数で指定してください");
  const deadline = Date.now() + timeoutMinutes * 60_000;
  const api = deviceApi(config);
  if (!opts.json) warn(`スマホからの回答を待っています（最長 ${timeoutMinutes} 分、20 秒ごとに確認）...`);
  while (Date.now() < deadline) {
    const { tasks } = await api<{ tasks: Task[] }>("GET", "/api/device/tasks", {
      query: { kind: "review", status: "answered", sessionId: session },
    });
    if (tasks.length) {
      if (opts.json) return printJson({ answered: tasks });
      for (const task of tasks) {
        info(`[${task.id}] ${task.title}  → ${task.approved ? "承認" : "コメント"}${task.responseText ? `: ${task.responseText}` : ""}`);
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20_000));
  }
  if (opts.json) printJson({ answered: [], timedOut: true });
  else warn("時間切れです。回答はまだありません。");
  process.exitCode = 2;
}
