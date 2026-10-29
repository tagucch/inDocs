#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    date: { type: "string" },
    days: { type: "string", default: "1" },
    repo: { type: "string", multiple: true },
    out: { type: "string" },
    "body-chars": { type: "string", default: "1500" },
  },
});

function gh(args) {
  return execFileSync("gh", ["api", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function localMidnight(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function ymdOf(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

const days = Math.max(1, Number(values.days));
const end = values.date ? new Date(localMidnight(values.date).getTime() + 86400000) : localMidnight(ymdOf(new Date()));
const start = new Date(end.getTime() - days * 86400000);
const lastDay = new Date(end.getTime() - 86400000);
const label = days === 1 ? ymdOf(start) : `${ymdOf(start)} 〜 ${ymdOf(lastDay)}`;

const repos = values.repo?.length
  ? values.repo
  : gh(["user/subscriptions", "--paginate", "--jq", ".[].full_name"]).trim().split("\n").filter(Boolean);

function cleanBody(body, limit) {
  if (!body) return "";
  const text = body.replace(/<!--[\s\S]*?-->/g, "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function prState(pr) {
  if (pr.merged) return "merged";
  if (pr.draft) return "draft";
  return pr.state;
}

const bodyChars = Number(values["body-chars"]);
const items = [];
const errors = [];

for (const repo of repos) {
  try {
    for (let page = 1; page <= 10; page++) {
      const query = `state=all&since=${encodeURIComponent(start.toISOString())}&sort=created&direction=desc&per_page=100&page=${page}`;
      const list = JSON.parse(gh([`repos/${repo}/issues?${query}`]));
      for (const it of list) {
        const created = new Date(it.created_at);
        if (created < start || created >= end) continue;
        const base = {
          repo,
          number: it.number,
          title: it.title,
          url: it.html_url,
          author: it.user?.login ?? "",
          authorUrl: it.user?.html_url ?? "",
          createdAt: it.created_at,
          labels: (it.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)),
          comments: it.comments ?? 0,
          body: cleanBody(it.body, bodyChars),
        };
        if (it.pull_request) {
          const pr = JSON.parse(gh([`repos/${repo}/pulls/${it.number}`]));
          items.push({
            ...base,
            type: "pr",
            state: prState(pr),
            additions: pr.additions,
            deletions: pr.deletions,
            changedFiles: pr.changed_files,
            baseRef: pr.base?.ref,
            headRef: pr.head?.ref,
          });
        } else {
          items.push({ ...base, type: "issue", state: it.state, stateReason: it.state_reason ?? null });
        }
      }
      const oldest = list.at(-1);
      if (list.length < 100 || (oldest && new Date(oldest.created_at) < start)) break;
    }
  } catch (err) {
    errors.push({ repo, message: String(err.stderr || err.message).trim().split("\n")[0] });
  }
}

items.sort((a, b) => a.repo.localeCompare(b.repo) || a.createdAt.localeCompare(b.createdAt));

const result = {
  window: { start: start.toISOString(), end: end.toISOString(), label, days },
  generatedAt: new Date().toISOString(),
  repos,
  counts: {
    issues: items.filter((i) => i.type === "issue").length,
    prs: items.filter((i) => i.type === "pr").length,
    activeRepos: new Set(items.map((i) => i.repo)).size,
  },
  items,
  errors,
};

const json = JSON.stringify(result, null, 2);
if (values.out) {
  writeFileSync(values.out, json);
  console.error(`${values.out}: ${result.counts.issues} issues, ${result.counts.prs} PRs in ${result.counts.activeRepos}/${repos.length} repos (${label})`);
} else {
  process.stdout.write(json + "\n");
}
