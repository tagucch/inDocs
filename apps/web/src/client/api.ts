import type {
  AnswerBody,
  DeviceSummary,
  MeResponse,
  PageStatePatch,
  PagesResponse,
  PairingResponse,
  ProjectStatePatch,
  Task,
} from "../shared/types";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new HttpError(0, "offline", "サーバーに接続できません");
  }
  const json = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!response.ok) {
    throw new HttpError(response.status, json?.error ?? `http_${response.status}`, json?.message ?? `エラー (${response.status})`);
  }
  return json as T;
}

export const api = {
  me: () => call<MeResponse>("GET", "/auth/me"),
  logout: () => call<{ ok: true }>("POST", "/auth/logout"),
  pages: () => call<PagesResponse>("GET", "/api/owner/pages"),
  setPageState: (slug: string, patch: PageStatePatch) =>
    call<{ slug: string; unread: boolean; starred: boolean; hidden: boolean }>("PUT", `/api/owner/pages/${encodeURIComponent(slug)}/state`, patch),
  setProjectState: (project: string, patch: ProjectStatePatch) =>
    call<{ project: string; starred: boolean; pinned: boolean }>("PUT", `/api/owner/projects/${encodeURIComponent(project)}/state`, patch),
  tasks: (all = false) => call<{ tasks: Task[] }>("GET", all ? "/api/owner/tasks?all=1" : "/api/owner/tasks"),
  createRequest: (body: string, target?: string) => call<Task>("POST", "/api/owner/tasks", { body, target }),
  answerTask: (id: string, answer: AnswerBody) => call<Task>("POST", `/api/owner/tasks/${encodeURIComponent(id)}/answer`, answer),
  deleteTask: (id: string) => call<{ ok: true }>("DELETE", `/api/owner/tasks/${encodeURIComponent(id)}`),
  createPairing: () => call<PairingResponse>("POST", "/api/owner/pairings"),
  devices: () => call<DeviceSummary[]>("GET", "/api/owner/devices"),
  revokeDevice: (id: string) => call<{ ok: true }>("DELETE", `/api/owner/devices/${encodeURIComponent(id)}`),
};
