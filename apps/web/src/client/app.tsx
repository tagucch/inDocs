import { useEffect, useMemo, useState } from "preact/hooks";
import { api } from "./api";
import { Login } from "./components/Login";
import { usePath } from "./router";
import { usePages, useTasks } from "./store";
import { InboxView } from "./views/InboxView";
import { ListView } from "./views/ListView";
import { SettingsView } from "./views/SettingsView";
import { Viewer } from "./views/Viewer";

export function App() {
  const [auth, setAuth] = useState<"loading" | "out" | "in">("loading");
  const [email, setEmail] = useState("");

  useEffect(() => {
    api
      .me()
      .then((me) => {
        setEmail(me.email);
        setAuth("in");
      })
      .catch(() => setAuth("out"));
  }, []);

  if (auth === "loading") return <div class="empty">読み込み中…</div>;
  if (auth === "out") return <Login />;
  return <Shell email={email} />;
}

function Shell({ email }: { email: string }) {
  const path = usePath();
  const store = usePages();
  const tasks = useTasks();
  const pendingReviews = tasks.tasks.filter((t) => t.kind === "review" && t.status === "waiting").length;
  const projects = useMemo(() => [...new Set((store.data?.pages ?? []).map((p) => p.project))].sort(), [store.data]);
  const pageMatch = /^\/p\/([a-z0-9-]+)$/.exec(path);

  let view;
  if (path === "/inbox") view = <InboxView tasks={tasks} projects={projects} />;
  else if (path === "/settings") view = <SettingsView email={email} />;
  else view = <ListView store={store} pendingReviews={pendingReviews} />;

  return (
    <>
      {view}
      {pageMatch?.[1] ? <Viewer slug={pageMatch[1]} store={store} /> : null}
    </>
  );
}
