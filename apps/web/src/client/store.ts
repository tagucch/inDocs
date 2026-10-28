import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { PageStatePatch, PagesResponse, ProjectStatePatch, Task } from "../shared/types";
import { HttpError, api } from "./api";

export function redirectToLogin(): void {
  const here = `${location.pathname}${location.search}`;
  location.assign(`/auth/login?return=${encodeURIComponent(here)}`);
}

export function describeError(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

function isUnauthorized(err: unknown): boolean {
  return err instanceof HttpError && err.status === 401;
}

export type PagesStore = {
  data: PagesResponse | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  patchPage: (slug: string, patch: PageStatePatch) => void;
  patchProject: (project: string, patch: ProjectStatePatch) => void;
};

export function usePages(): PagesStore {
  const [data, setData] = useState<PagesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inflight = useRef<Promise<void> | null>(null);

  const reload = useCallback(async () => {
    if (inflight.current) return inflight.current;
    setLoading(true);
    inflight.current = api
      .pages()
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (isUnauthorized(err)) return redirectToLogin();
        setError(describeError(err));
      })
      .finally(() => {
        setLoading(false);
        inflight.current = null;
      });
    return inflight.current;
  }, []);

  useEffect(() => {
    void reload();
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [reload]);

  const patchPage = useCallback(
    (slug: string, patch: PageStatePatch) => {
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          pages: current.pages.map((p) =>
            p.slug === slug
              ? {
                  ...p,
                  unread: patch.read === undefined ? p.unread : !patch.read,
                  starred: patch.starred ?? p.starred,
                  hidden: patch.hidden ?? p.hidden,
                }
              : p,
          ),
        };
      });
      api.setPageState(slug, patch).catch((err: unknown) => {
        if (isUnauthorized(err)) return redirectToLogin();
        setError(describeError(err));
        void reload();
      });
    },
    [reload],
  );

  const patchProject = useCallback(
    (project: string, patch: ProjectStatePatch) => {
      setData((current) => {
        if (!current) return current;
        const existing = current.projects.find((p) => p.project === project);
        const next = { project, starred: false, pinned: false, ...existing, ...patch };
        return {
          ...current,
          projects: existing ? current.projects.map((p) => (p.project === project ? next : p)) : [...current.projects, next],
        };
      });
      api.setProjectState(project, patch).catch((err: unknown) => {
        if (isUnauthorized(err)) return redirectToLogin();
        setError(describeError(err));
        void reload();
      });
    },
    [reload],
  );

  return { data, error, loading, reload, patchPage, patchProject };
}

export type TasksStore = {
  tasks: Task[];
  loaded: boolean;
  error: string | null;
  reload: () => Promise<void>;
  createRequest: (body: string, target?: string) => Promise<void>;
  answer: (id: string, approved: boolean, responseText?: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

const TASK_POLL_MS = 60_000;

export function useTasks(): TasksStore {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const { tasks: next } = await api.tasks();
      setTasks(next);
      setError(null);
    } catch (err) {
      if (isUnauthorized(err)) return redirectToLogin();
      setError(describeError(err));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, TASK_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  const createRequest = useCallback(
    async (body: string, target?: string) => {
      const created = await api.createRequest(body, target);
      setTasks((current) => [created, ...current]);
    },
    [],
  );

  const answer = useCallback(async (id: string, approved: boolean, responseText?: string) => {
    const updated = await api.answerTask(id, { approved, responseText });
    setTasks((current) => current.map((t) => (t.id === id ? updated : t)));
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.deleteTask(id);
    setTasks((current) => current.filter((t) => t.id !== id));
  }, []);

  return { tasks, loaded, error, reload, createRequest, answer, remove };
}
