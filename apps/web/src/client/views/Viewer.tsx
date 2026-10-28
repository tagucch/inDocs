import { useEffect, useRef, useState } from "preact/hooks";
import { formatTime } from "../../shared/grouping";
import { goBack } from "../components/Header";
import { Icon } from "../components/Icons";
import type { PagesStore } from "../store";

export function Viewer({ slug, store }: { slug: string; store: PagesStore }) {
  const page = store.data?.pages.find((p) => p.slug === slug);
  const [menu, setMenu] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const marked = useRef<string | null>(null);

  useEffect(() => {
    if (page && page.unread && marked.current !== slug) {
      marked.current = slug;
      store.patchPage(slug, { read: true });
    }
  }, [page, slug, store]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const viewUrl = `/view/${encodeURIComponent(slug)}`;

  return (
    <div class="viewer" role="dialog" aria-label={page?.title ?? slug}>
      <div class="viewer-bar">
        <button class="icon-btn" aria-label="一覧に戻る" onClick={() => goBack()}>
          <Icon name="back" />
        </button>
        <div class="vtitle">
          {page?.title ?? (store.data ? "このページは見つかりません" : "読み込み中…")}
          {page ? (
            <span class="vsub">
              {page.project}・{formatTime(page.updatedAt)}
            </span>
          ) : null}
        </div>
        {page ? (
          <>
            <button
              class={`toggle star ${page.starred ? "on" : ""}`}
              aria-label={page.starred ? "スターを外す" : "スターを付ける"}
              aria-pressed={page.starred}
              onClick={() => store.patchPage(slug, { starred: !page.starred })}
            >
              <Icon name="star" filled={page.starred} />
            </button>
            <a class="icon-btn" href={viewUrl} target="_blank" rel="noopener" aria-label="新しいタブで開く">
              <Icon name="external" />
            </a>
            <button class="icon-btn" aria-label="その他" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <Icon name="more" />
            </button>
          </>
        ) : null}
      </div>
      {menu && page ? (
        <div class="panel" style={{ position: "absolute", right: 8, top: 56, zIndex: 2, padding: 8, minWidth: 220 }}>
          <button
            class="row"
            onClick={() => {
              store.patchPage(slug, { read: false });
              goBack();
            }}
          >
            <Icon name="mail" />
            <span class="title">未読に戻す</span>
          </button>
          <button
            class="row"
            onClick={() => {
              store.patchPage(slug, { hidden: !page.hidden });
              goBack();
            }}
          >
            <Icon name="eyeOff" />
            <span class="title">{page.hidden ? "一覧に戻す" : "一覧から隠す"}</span>
          </button>
          <button
            class="row"
            onClick={() => {
              setFrameKey((k) => k + 1);
              setMenu(false);
            }}
          >
            <Icon name="refresh" />
            <span class="title">ページを読み直す</span>
          </button>
          {page.source ? (
            <div class="row" style={{ cursor: "default" }}>
              <span class="title" style={{ whiteSpace: "normal", fontSize: 12, color: "var(--muted)" }}>
                {page.source}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      <div class="frame-wrap" onClick={() => menu && setMenu(false)}>
        {page ? <iframe key={frameKey} src={viewUrl} title={page.title} /> : null}
      </div>
    </div>
  );
}
