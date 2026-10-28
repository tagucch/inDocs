import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { groupByProject, matchesQuery, sectionize, starredGroups, type ProjectGroup } from "../../shared/grouping";
import type { PageSummary } from "../../shared/types";
import { Header } from "../components/Header";
import { Icon } from "../components/Icons";
import { ProjectCard } from "../components/ProjectCard";
import { Link } from "../router";
import type { PagesStore } from "../store";

type Filter = { kind: "all" } | { kind: "unread" } | { kind: "starred" } | { kind: "project"; project: string };

export function ListView({ store, pendingReviews }: { store: PagesStore; pendingReviews: number }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [showHidden, setShowHidden] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setNow(new Date());
  }, [store.data]);
  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        setSearching(true);
      }
      if (event.key === "Escape" && searching) {
        setSearching(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searching]);

  const pages = store.data?.pages ?? [];
  const projects = store.data?.projects ?? [];
  const hiddenCount = pages.filter((p) => p.hidden).length;
  const unreadCount = pages.filter((p) => p.unread && !p.hidden).length;

  const pinnedProjects = useMemo(() => {
    const names = new Set(pages.map((p) => p.project));
    return projects.filter((p) => p.pinned && names.has(p.project)).map((p) => p.project);
  }, [pages, projects]);

  const visible = useMemo(() => {
    const q = query.trim();
    return pages.filter((p) => {
      if (showHidden ? !p.hidden : p.hidden) return false;
      if (filter.kind === "unread" && !p.unread) return false;
      if (filter.kind === "project" && p.project !== filter.project) return false;
      if (q && !matchesQuery(p, q)) return false;
      return true;
    });
  }, [pages, query, filter, showHidden]);

  const groups = useMemo(() => groupByProject(visible, projects), [visible, projects]);
  const isPlain = filter.kind === "all" && !query.trim() && !showHidden;
  const starred = useMemo(() => (isPlain || filter.kind === "starred" ? starredGroups(groups) : []), [groups, isPlain, filter]);
  const starredKeys = useMemo(() => new Set(starred.filter((g) => g.starred).map((g) => g.project)), [starred]);
  const remaining = useMemo<ProjectGroup[]>(() => {
    if (filter.kind === "starred") return [];
    if (!isPlain) return groups;
    return groups
      .filter((g) => !starredKeys.has(g.project))
      .map((g) => {
        const pagesLeft = g.pages.filter((p) => !p.starred);
        return pagesLeft.length === g.pages.length ? g : { ...g, pages: pagesLeft, unread: pagesLeft.filter((p) => p.unread).length };
      })
      .filter((g) => g.pages.length > 0);
  }, [groups, isPlain, starredKeys, filter]);
  const sections = useMemo(() => sectionize(remaining, now), [remaining, now]);

  const onOpen = (page: PageSummary) => {
    if (page.unread) store.patchPage(page.slug, { read: true });
  };
  const chipFor = (f: Filter) => (f.kind === "project" ? `project:${f.project}` : f.kind);
  const active = chipFor(filter);

  return (
    <>
      <Header
        below={
          <>
            {searching ? (
              <div class="search-row">
                <input
                  ref={searchRef}
                  type="search"
                  placeholder="タイトル・プロジェクト・ファイル名で検索"
                  value={query}
                  onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                  enterKeyHint="search"
                />
                <button
                  class="icon-btn"
                  aria-label="検索を閉じる"
                  onClick={() => {
                    setSearching(false);
                    setQuery("");
                  }}
                >
                  <Icon name="x" />
                </button>
              </div>
            ) : null}
            <div class="chips" role="tablist">
              <button class={`chip ${active === "all" ? "active" : ""}`} onClick={() => setFilter({ kind: "all" })}>
                すべて
              </button>
              <button class={`chip ${active === "unread" ? "active" : ""}`} onClick={() => setFilter({ kind: "unread" })}>
                未読 {unreadCount > 0 ? <span class="num">{unreadCount}</span> : null}
              </button>
              <button class={`chip ${active === "starred" ? "active" : ""}`} onClick={() => setFilter({ kind: "starred" })}>
                スター
              </button>
              {pinnedProjects.map((project) => (
                <button
                  key={project}
                  class={`chip ${active === `project:${project}` ? "active" : ""}`}
                  onClick={() => setFilter(active === `project:${project}` ? { kind: "all" } : { kind: "project", project })}
                >
                  <Icon name="pin" filled size={12} />
                  <span class="ellipsis">{project}</span>
                </button>
              ))}
            </div>
          </>
        }
      >
        <button class="icon-btn" aria-label="検索" onClick={() => setSearching((s) => !s)}>
          <Icon name="search" />
        </button>
        <Link href="/inbox" class="icon-btn" aria-label="インボックス">
          <Icon name="inbox" />
          {pendingReviews > 0 ? <span class="badge">{pendingReviews}</span> : null}
        </Link>
        <button class={`icon-btn ${store.loading ? "spin" : ""}`} aria-label="更新" onClick={() => void store.reload()}>
          <Icon name="refresh" />
        </button>
        <Link href="/settings" class="icon-btn" aria-label="設定">
          <Icon name="settings" />
        </Link>
      </Header>
      <main>
        {store.error ? <div class="error">{store.error}</div> : null}
        {!store.data && !store.error ? <div class="empty">読み込み中…</div> : null}
        {store.data && pages.length === 0 ? (
          <div class="empty">
            まだページがありません。
            <br />
            Claude Code に「この HTML を inDocs に共有して」と頼むと、ここに並びます。
            <br />
            <Link href="/settings">この PC を登録する</Link>
          </div>
        ) : null}
        {starred.length > 0 ? (
          <>
            <h2 class="section-title">
              スター <span class="count">{starred.length}テーマ・{starred.reduce((n, g) => n + g.pages.length, 0)}件</span>
            </h2>
            <div class="grid">
              {starred.map((group) => (
                <ProjectCard
                  key={`star-${group.project}`}
                  group={group}
                  now={now}
                  onToggleStar={(p, v) => store.patchProject(p, { starred: v })}
                  onTogglePin={(p, v) => store.patchProject(p, { pinned: v })}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </>
        ) : null}
        {sections.map((section) => (
          <div key={section.bucket.key}>
            <h2 class="section-title">
              {query.trim() ? "検索結果" : section.bucket.label}{" "}
              <span class="count">
                {section.groups.length}テーマ・{section.groups.reduce((n, g) => n + g.pages.length, 0)}件
              </span>
            </h2>
            <div class="grid">
              {section.groups.map((group) => (
                <ProjectCard
                  key={group.project}
                  group={group}
                  now={now}
                  onToggleStar={(p, v) => store.patchProject(p, { starred: v })}
                  onTogglePin={(p, v) => store.patchProject(p, { pinned: v })}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </div>
        ))}
        {store.data && pages.length > 0 && visible.length === 0 ? (
          <div class="empty">{showHidden ? "非表示のページはありません。" : "条件に合うページがありません。"}</div>
        ) : null}
        {hiddenCount > 0 || showHidden ? (
          <p style={{ textAlign: "center", marginTop: 24 }}>
            <button class="link-btn" onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? "一覧に戻る" : `非表示にしたページ ${hiddenCount} 件を見る`}
            </button>
          </p>
        ) : null}
      </main>
    </>
  );
}
