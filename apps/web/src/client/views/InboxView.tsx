import { useMemo, useState } from "preact/hooks";
import { formatRelative } from "../../shared/grouping";
import type { Task } from "../../shared/types";
import { Header } from "../components/Header";
import { Icon } from "../components/Icons";
import { describeError, type TasksStore } from "../store";

export function InboxView({ tasks, projects }: { tasks: TasksStore; projects: string[] }) {
  const requests = useMemo(() => tasks.tasks.filter((t) => t.kind === "request" && t.status !== "completed"), [tasks.tasks]);
  const reviews = useMemo(() => tasks.tasks.filter((t) => t.kind === "review" && t.status !== "completed"), [tasks.tasks]);
  const waiting = reviews.filter((t) => t.status === "waiting").length;

  return (
    <>
      <Header title="インボックス" back>
        <span style={{ fontSize: 13, opacity: 0.9, marginRight: "auto" }}>{waiting > 0 ? `確認待ち ${waiting} 件` : ""}</span>
        <button class="icon-btn" aria-label="更新" onClick={() => void tasks.reload()}>
          <Icon name="refresh" />
        </button>
      </Header>
      <main>
        {tasks.error ? <div class="error">{tasks.error}</div> : null}
        <RequestForm tasks={tasks} projects={projects} />
        <section class="panel">
          <h2>
            Claude への依頼 <span class="count">{requests.length}件</span>
          </h2>
          {requests.length === 0 ? <p class="task-ctx">置いてある依頼はありません。</p> : null}
          {requests.map((task) => (
            <RequestItem key={task.id} task={task} tasks={tasks} />
          ))}
        </section>
        <section class="panel">
          <h2>
            Claude からの確認 <span class="count">{reviews.length}件</span>
          </h2>
          {reviews.length === 0 ? <p class="task-ctx">確認待ちのカードはありません。PC の Claude Code で /mobile を使うとここに届きます。</p> : null}
          {reviews.map((task) => (
            <ReviewCard key={task.id} task={task} tasks={tasks} />
          ))}
        </section>
      </main>
    </>
  );
}

function RequestForm({ tasks, projects }: { tasks: TasksStore; projects: string[] }) {
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await tasks.createRequest(body.trim(), target.trim() || undefined);
      setBody("");
      setTarget("");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="panel">
      <textarea
        class="input"
        rows={3}
        placeholder="やっておいてほしいことを書く"
        value={body}
        onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)}
      />
      <div class="form-row">
        <input
          class="input"
          style={{ flex: 1, minWidth: 180 }}
          list="indocs-projects"
          placeholder="プロジェクト名（任意）"
          value={target}
          onInput={(e) => setTarget((e.target as HTMLInputElement).value)}
        />
        <datalist id="indocs-projects">
          {projects.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>
      <div class="form-row">
        <span class="hint">
          PC で <b>/inbox</b> と打つと、Claude Code がここから読み取ります。
        </span>
        <button class="btn primary" disabled={!body.trim() || busy} onClick={() => void submit()}>
          頼む
        </button>
      </div>
      {error ? <div class="error">{error}</div> : null}
    </section>
  );
}

function RequestItem({ task, tasks }: { task: Task; tasks: TasksStore }) {
  const [busy, setBusy] = useState(false);
  return (
    <div class="task">
      <div class="task-head">
        <span class="dot" aria-hidden="true" />
        <span>{task.target ? task.target : "宛先なし"}</span>
        <span class="when">{formatRelative(task.createdAt)}</span>
        <button
          class="btn danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await tasks.remove(task.id);
            } finally {
              setBusy(false);
            }
          }}
        >
          取り消す
        </button>
      </div>
      <div class="task-ctx" style={{ color: "inherit", marginTop: 6 }}>
        {task.body}
      </div>
    </div>
  );
}

function ReviewCard({ task, tasks }: { task: Task; tasks: TasksStore }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answered = task.status === "answered";

  const send = async (approved: boolean) => {
    if (busy) return;
    if (!approved && !comment.trim()) {
      setError("コメントを入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await tasks.answer(task.id, approved, comment.trim() || undefined);
      setComment("");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class={`task ${answered ? "done" : ""}`}>
      <div class="task-head">
        {answered ? <span class={`pill ${task.approved ? "ok" : ""}`}>{task.approved ? "承認済み" : "コメント済み"}</span> : <span class="dot" aria-hidden="true" />}
        <span>{task.title}</span>
        <span class="when">
          {task.deviceName ? `${task.deviceName}・` : ""}
          {formatRelative(task.createdAt)}
        </span>
      </div>
      <div class="task-q">{task.body}</div>
      {task.context ? <div class="task-ctx">{task.context}</div> : null}
      {task.recommendation ? (
        <div class="task-rec">
          <b>Claude の推奨：</b>
          {task.recommendation}
        </div>
      ) : null}
      {answered ? (
        <div class="task-ctx" style={{ marginTop: 6 }}>
          {task.responseText ? `返答: ${task.responseText}` : "返答を PC に渡しました。"}
          <br />
          PC 側が取り込むとこのカードは消えます。
        </div>
      ) : (
        <>
          <button class="btn primary block" style={{ marginTop: 12 }} disabled={busy} onClick={() => void send(true)}>
            承認
          </button>
          <div class="task-actions">
            <input
              class="input"
              placeholder="コメントを入力"
              value={comment}
              onInput={(e) => setComment((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.isComposing) void send(false);
              }}
            />
            <button class="btn dark" disabled={busy || !comment.trim()} onClick={() => void send(false)}>
              送る
            </button>
          </div>
          {error ? <div class="error">{error}</div> : null}
        </>
      )}
    </div>
  );
}
