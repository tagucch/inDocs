import type { PageSummary, ProjectState } from "./types";

const JST_OFFSET = 9 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

type JstDate = { y: number; m: number; d: number; weekday: number; dayIndex: number; hh: string; mm: string };

export function toJst(date: Date): JstDate {
  const t = new Date(date.getTime() + JST_OFFSET);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    weekday: t.getUTCDay(),
    dayIndex: Math.floor(t.getTime() / DAY_MS),
    hh: String(t.getUTCHours()).padStart(2, "0"),
    mm: String(t.getUTCMinutes()).padStart(2, "0"),
  };
}

export type Bucket = { key: string; label: string; order: number };

export function dateBucket(iso: string, now: Date = new Date()): Bucket {
  const target = toJst(new Date(iso));
  const today = toJst(now);
  const diff = today.dayIndex - target.dayIndex;
  if (diff <= 0) return { key: "today", label: "今日", order: 0 };
  if (diff === 1) return { key: "yesterday", label: "昨日", order: 1 };
  const weekStart = today.dayIndex - ((today.weekday + 6) % 7);
  if (target.dayIndex >= weekStart) return { key: "this-week", label: "今週", order: 2 };
  if (target.dayIndex >= weekStart - 7) return { key: "last-week", label: "先週", order: 3 };
  if (target.y === today.y && target.m === today.m) return { key: "this-month", label: "今月", order: 4 };
  const lastMonth = today.m === 1 ? { y: today.y - 1, m: 12 } : { y: today.y, m: today.m - 1 };
  if (target.y === lastMonth.y && target.m === lastMonth.m) return { key: "last-month", label: "先月", order: 5 };
  if (target.y === today.y) return { key: `${target.y}-${target.m}`, label: `${target.m}月`, order: 100 + (12 - target.m) };
  return {
    key: `${target.y}-${target.m}`,
    label: `${target.y}年${target.m}月`,
    order: 200 + (today.y - target.y) * 12 + (12 - target.m),
  };
}

export function formatTime(iso: string, now: Date = new Date()): string {
  const target = toJst(new Date(iso));
  const today = toJst(now);
  const diff = today.dayIndex - target.dayIndex;
  const clock = `${target.hh}:${target.mm}`;
  if (diff <= 0) return clock;
  if (diff === 1) return `昨日 ${clock}`;
  if (diff < 7) return `${WEEKDAYS[target.weekday]}曜 ${clock}`;
  if (target.y === today.y) return `${target.m}/${target.d}`;
  return `${target.y}/${target.m}/${target.d}`;
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return formatTime(iso, now);
}

export type ProjectGroup = {
  project: string;
  projectLabel: string | null;
  pages: PageSummary[];
  latest: string;
  unread: number;
  starred: boolean;
  pinned: boolean;
};

export function groupByProject(pages: PageSummary[], projects: ProjectState[]): ProjectGroup[] {
  const states = new Map(projects.map((p) => [p.project, p]));
  const groups = new Map<string, ProjectGroup>();
  const sorted = [...pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const page of sorted) {
    let group = groups.get(page.project);
    if (!group) {
      const state = states.get(page.project);
      group = {
        project: page.project,
        projectLabel: page.projectLabel,
        pages: [],
        latest: page.updatedAt,
        unread: 0,
        starred: state?.starred ?? false,
        pinned: state?.pinned ?? false,
      };
      groups.set(page.project, group);
    }
    group.pages.push(page);
    if (page.unread) group.unread += 1;
    if (!group.projectLabel && page.projectLabel) group.projectLabel = page.projectLabel;
  }
  return [...groups.values()];
}

export type Section = { bucket: Bucket; groups: ProjectGroup[] };

export function sectionize(groups: ProjectGroup[], now: Date = new Date()): Section[] {
  const sections = new Map<string, Section>();
  for (const group of groups) {
    const bucket = dateBucket(group.latest, now);
    let section = sections.get(bucket.key);
    if (!section) {
      section = { bucket, groups: [] };
      sections.set(bucket.key, section);
    }
    section.groups.push(group);
  }
  return [...sections.values()].sort((a, b) => a.bucket.order - b.bucket.order);
}

export function starredGroups(groups: ProjectGroup[]): ProjectGroup[] {
  const out: ProjectGroup[] = [];
  for (const group of groups) {
    if (group.starred) {
      out.push(group);
      continue;
    }
    const pages = group.pages.filter((p) => p.starred);
    if (pages.length) out.push({ ...group, pages, unread: pages.filter((p) => p.unread).length });
  }
  return out;
}

export function matchesQuery(page: PageSummary, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = [page.title, page.project, page.projectLabel ?? "", page.source ?? "", page.slug].join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
