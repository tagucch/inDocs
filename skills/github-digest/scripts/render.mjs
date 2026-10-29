#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { data: { type: "string" }, summaries: { type: "string" }, out: { type: "string" } },
});
if (!values.data) {
  console.error("usage: node render.mjs --data digest.json [--summaries summaries.json] [--out file.html]");
  process.exit(1);
}

const data = JSON.parse(readFileSync(values.data, "utf8"));
const summaries = values.summaries ? JSON.parse(readFileSync(values.summaries, "utf8")) : {};
const itemSummaries = summaries.items ?? {};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const pad = (n) => String(n).padStart(2, "0");
const fmtDate = (d) => `${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`;
const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtStamp = (d) => `${d.getMonth() + 1}/${d.getDate()} ${fmtTime(d)}`;

const start = new Date(data.window.start);
const end = new Date(data.window.end);
const lastMoment = new Date(end.getTime() - 1);
const isRange = data.window.mode === "range";
const multiDay = fmtDate(start) !== fmtDate(lastMoment);
const dateLine = isRange
  ? multiDay
    ? `${fmtDate(start)}${fmtTime(start)} 〜 ${fmtDate(end)}${fmtTime(end)}`
    : `${fmtDate(start)}${fmtTime(start)} 〜 ${fmtTime(end)}`
  : multiDay
    ? `${fmtDate(start)} 〜 ${fmtDate(lastMoment)}`
    : fmtDate(start);
const title = `GitHub 朝刊 ${data.window.title ?? data.window.label}`;
const generated = new Date(data.generatedAt);

const STATE = {
  "issue:open": ["Open", "open"],
  "issue:closed:completed": ["Closed", "merged"],
  "issue:closed:not_planned": ["Not planned", "draft"],
  "issue:closed": ["Closed", "merged"],
  "pr:open": ["Open", "open"],
  "pr:draft": ["Draft", "draft"],
  "pr:merged": ["Merged", "merged"],
  "pr:closed": ["Closed", "closed"],
};

function stateOf(it) {
  return STATE[`${it.type}:${it.state}:${it.stateReason ?? ""}`] ?? STATE[`${it.type}:${it.state}`] ?? [it.state, "draft"];
}

function excerpt(body) {
  const text = body.replace(/^#+\s.*$/gm, "").replace(/[`*_>#\[\]()]/g, "").replace(/\s+/g, " ").trim();
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

function renderItem(it) {
  const [stateText, stateCls] = stateOf(it);
  const kind = it.type === "pr" ? "PR" : "Issue";
  const created = new Date(it.createdAt);
  const summary = itemSummaries[`${it.repo}#${it.number}`];
  const meta = [
    `<a href="${esc(it.authorUrl)}">@${esc(it.author)}</a>`,
    multiDay ? fmtStamp(created) : fmtTime(created),
  ];
  if (it.type === "pr" && it.additions != null) {
    meta.push(`<span class="diff"><ins>+${it.additions}</ins> <del>−${it.deletions}</del> · ${it.changedFiles} files</span>`);
  }
  if (it.comments) meta.push(`コメント ${it.comments}`);
  const labels = it.labels.map((l) => `<span class="label">${esc(l)}</span>`).join("");
  const body = summary
    ? `<p class="summary">${esc(summary)}</p>`
    : it.body
      ? `<p class="summary fallback">${esc(excerpt(it.body))}</p>`
      : "";
  return `
      <article class="item">
        <div class="item-head">
          <span class="chip ${stateCls}"><b>${kind}</b>${esc(stateText)}</span>
          <a class="num" href="${esc(it.url)}">#${it.number}</a>
        </div>
        <h3><a href="${esc(it.url)}">${esc(it.title)}</a></h3>
        <p class="meta">${meta.join(" · ")}${labels ? ` <span class="labels">${labels}</span>` : ""}</p>
        ${body}
      </article>`;
}

const groups = new Map();
for (const it of data.items) {
  if (!groups.has(it.repo)) groups.set(it.repo, []);
  groups.get(it.repo).push(it);
}

function renderGroup(repo, items) {
  const [owner, name] = repo.split("/");
  const issues = items.filter((i) => i.type === "issue").length;
  const prs = items.filter((i) => i.type === "pr").length;
  const counts = [issues && `Issue ${issues}`, prs && `PR ${prs}`].filter(Boolean).join(" · ");
  return `
    <section class="repo">
      <h2><a href="https://github.com/${esc(repo)}"><span class="owner">${esc(owner)}/</span>${esc(name)}</a><span class="count">${counts}</span></h2>
      ${items.map(renderItem).join("")}
    </section>`;
}

const errors = data.errors.length
  ? `
    <section class="errors">
      <h2>取得できなかったリポジトリ</h2>
      <ul>${data.errors.map((e) => `<li><b>${esc(e.repo)}</b> ${esc(e.message)}</li>`).join("")}</ul>
    </section>`
  : "";

const empty = `
    <section class="empty">
      <p>${isRange || multiDay ? "この期間" : "この日"}の新着 Issue / PR はありませんでした。</p>
    </section>`;

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@700&text=GitHub%E6%9C%9D%E5%88%8A&display=swap">
<style>
:root {
  --bg: #f4f5f7;
  --surface: #ffffff;
  --fg: #1c2128;
  --muted: #5d6673;
  --line: #dfe3e8;
  --accent: #1f5fbf;
  --open: #1a7f37;
  --merged: #7d4cdb;
  --closed: #c93c37;
  --draft: #6e7781;
  --font-display: "Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
  --font-body: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", "Segoe UI", sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0f1216; --surface: #161b22; --fg: #e6ebf1; --muted: #98a2b0; --line: #2a313b;
    --accent: #7eb3ff; --open: #3fb950; --merged: #b18cff; --closed: #ff7b72; --draft: #8b949e;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #0f1216; --surface: #161b22; --fg: #e6ebf1; --muted: #98a2b0; --line: #2a313b;
  --accent: #7eb3ff; --open: #3fb950; --merged: #b18cff; --closed: #ff7b72; --draft: #8b949e;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.7;
  padding-block: 28px 56px;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }
main { max-width: 720px; margin: 0 auto; }
.masthead { display: grid; gap: 4px; padding-bottom: 16px; border-bottom: 2px solid var(--fg); }
.masthead h1 { margin: 0; font-family: var(--font-display); font-weight: 700; font-size: 2.1rem; line-height: 1.2; letter-spacing: 0.04em; }
.masthead .date { margin: 0; font-size: 1.05rem; font-weight: 600; }
.masthead .eyebrow { margin: 0; font-size: 0.8rem; color: var(--muted); letter-spacing: 0.04em; }
.stats { display: flex; flex-wrap: wrap; gap: 6px 22px; margin: 0; padding: 12px 0 0; font-variant-numeric: tabular-nums; font-size: 0.9rem; color: var(--muted); }
.stats div { display: flex; gap: 6px; align-items: baseline; }
.stats dt { margin: 0; }
.stats dd { margin: 0; font-size: 1.25rem; font-weight: 700; color: var(--fg); }
.lead { margin: 20px 0 0; padding: 14px 18px; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; font-size: 1rem; }
.lead p { margin: 0; }
.repo { margin-top: 32px; }
.repo h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin: 0 0 4px; font-size: 1.05rem; font-weight: 700; }
.repo h2 a { color: var(--fg); }
.repo h2 .owner { color: var(--muted); font-weight: 400; }
.repo h2 .count { font-size: 0.8rem; font-weight: 500; color: var(--muted); font-variant-numeric: tabular-nums; }
.item { padding: 14px 0; border-top: 1px solid var(--line); }
.item:last-child { border-bottom: 1px solid var(--line); }
.item-head { display: flex; align-items: center; gap: 10px; font-size: 0.78rem; }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 1px 8px; border-radius: 999px; border: 1px solid; font-weight: 600; letter-spacing: 0.02em; white-space: nowrap; }
.chip b { font-weight: 700; }
.chip.open { color: var(--open); border-color: color-mix(in srgb, var(--open) 45%, transparent); }
.chip.merged { color: var(--merged); border-color: color-mix(in srgb, var(--merged) 45%, transparent); }
.chip.closed { color: var(--closed); border-color: color-mix(in srgb, var(--closed) 45%, transparent); }
.chip.draft { color: var(--draft); border-color: color-mix(in srgb, var(--draft) 45%, transparent); }
.num { color: var(--muted); font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.item h3 { margin: 4px 0 2px; font-size: 1rem; font-weight: 600; line-height: 1.45; text-wrap: balance; overflow-wrap: anywhere; }
.item h3 a { color: var(--fg); }
.meta { margin: 0; font-size: 0.8rem; color: var(--muted); overflow-wrap: anywhere; }
.meta a { color: var(--muted); }
.diff { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.diff ins { color: var(--open); text-decoration: none; }
.diff del { color: var(--closed); text-decoration: none; }
.labels { display: inline-flex; flex-wrap: wrap; gap: 4px; vertical-align: middle; }
.label { padding: 0 6px; border-radius: 4px; background: color-mix(in srgb, var(--muted) 14%, transparent); font-size: 0.72rem; line-height: 1.6; }
.summary { margin: 8px 0 0; max-width: 42em; }
.summary.fallback { color: var(--muted); }
.empty { margin-top: 40px; padding: 28px 18px; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 6px; }
.empty p { margin: 0; }
.errors { margin-top: 32px; font-size: 0.9rem; }
.errors h2 { font-size: 0.95rem; margin: 0 0 6px; }
.errors ul { margin: 0; padding-left: 1.2em; color: var(--muted); }
footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 0.78rem; color: var(--muted); }
footer p { margin: 0; }
footer details { margin-top: 6px; }
footer summary { cursor: pointer; }
footer ul { margin: 4px 0 0; padding-left: 1.2em; columns: 2; column-gap: 24px; }
@media (max-width: 480px) { footer ul { columns: 1; } .masthead h1 { font-size: 1.8rem; } }
</style>
</head>
<body>
<main>
  <header class="masthead">
    <p class="eyebrow">${isRange ? "前回の朝刊からの新着 Issue / PR · " : "新着 Issue / PR · "}watch 中 ${data.repos.length} リポジトリ</p>
    <h1>GitHub 朝刊</h1>
    <p class="date">${esc(dateLine)}</p>
  </header>
  <dl class="stats">
    <div><dt>Issue</dt><dd>${data.counts.issues}</dd></div>
    <div><dt>PR</dt><dd>${data.counts.prs}</dd></div>
    <div><dt>動きのあったリポジトリ</dt><dd>${data.counts.activeRepos}<span style="font-size:0.85rem;font-weight:500;color:var(--muted)"> / ${data.repos.length}</span></dd></div>
  </dl>
  ${summaries.lead ? `<div class="lead"><p>${esc(summaries.lead)}</p></div>` : ""}
  ${groups.size ? [...groups].map(([repo, items]) => renderGroup(repo, items)).join("") : empty}
  ${errors}
  <footer>
    <p>発行 ${fmtStamp(generated)} · 対象期間 ${esc(data.window.label)}（日本時間）</p>
    <details><summary>対象リポジトリ ${data.repos.length} 件</summary><ul>${data.repos.map((r) => `<li><a href="https://github.com/${esc(r)}">${esc(r)}</a></li>`).join("")}</ul></details>
  </footer>
</main>
</body>
</html>
`;

const out = values.out ?? `github-digest-${data.window.slug ?? data.window.label.replace(/[^0-9-]+/g, "_")}.html`;
writeFileSync(out, html);
console.error(`${out}: ${data.items.length} items`);
