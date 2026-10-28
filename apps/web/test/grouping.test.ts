import { describe, expect, it } from "vitest";
import { dateBucket, formatTime, groupByProject, matchesQuery, sectionize, starredGroups } from "../src/shared/grouping";
import type { PageSummary } from "../src/shared/types";

const now = new Date("2026-10-28T09:00:00+09:00");

function page(partial: Partial<PageSummary> & { slug: string; updatedAt: string }): PageSummary {
  return {
    title: partial.slug,
    project: "p",
    projectLabel: null,
    source: null,
    size: 1,
    createdAt: partial.updatedAt,
    unread: false,
    starred: false,
    hidden: false,
    ...partial,
  };
}

describe("dateBucket", () => {
  it("JST の暦日で今日と昨日を分ける", () => {
    expect(dateBucket("2026-10-28T00:10:00+09:00", now).label).toBe("今日");
    expect(dateBucket("2026-10-27T23:50:00+09:00", now).label).toBe("昨日");
    expect(dateBucket("2026-10-27T15:10:00Z", now).label).toBe("今日");
  });

  it("月曜始まりの今週と先週を分ける", () => {
    expect(dateBucket("2026-10-26T10:00:00+09:00", now).label).toBe("今週");
    expect(dateBucket("2026-10-25T10:00:00+09:00", now).label).toBe("先週");
    expect(dateBucket("2026-10-19T10:00:00+09:00", now).label).toBe("先週");
    expect(dateBucket("2026-10-18T10:00:00+09:00", now).label).toBe("今月");
  });

  it("先月・同年の月・別の年を区別し、新しい順に並ぶ", () => {
    const buckets = [
      "2026-09-30T10:00:00+09:00",
      "2026-03-01T10:00:00+09:00",
      "2025-12-31T10:00:00+09:00",
      "2024-01-05T10:00:00+09:00",
    ].map((iso) => dateBucket(iso, now));
    expect(buckets.map((b) => b.label)).toEqual(["先月", "3月", "2025年12月", "2024年1月"]);
    const orders = buckets.map((b) => b.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});

describe("formatTime", () => {
  it("今日は時刻、昨日は接頭辞、今週は曜日、それ以外は日付", () => {
    expect(formatTime("2026-10-28T08:05:00+09:00", now)).toBe("08:05");
    expect(formatTime("2026-10-27T22:43:00+09:00", now)).toBe("昨日 22:43");
    expect(formatTime("2026-10-23T22:43:00+09:00", now)).toBe("金曜 22:43");
    expect(formatTime("2026-09-01T22:43:00+09:00", now)).toBe("9/1");
    expect(formatTime("2025-09-01T22:43:00+09:00", now)).toBe("2025/9/1");
  });
});

describe("groupByProject / sectionize / starredGroups", () => {
  const pages = [
    page({ slug: "a1", project: "A", updatedAt: "2026-10-28T08:00:00+09:00", unread: true }),
    page({ slug: "a2", project: "A", updatedAt: "2026-10-20T08:00:00+09:00", starred: true }),
    page({ slug: "b1", project: "B", updatedAt: "2026-10-27T08:00:00+09:00" }),
    page({ slug: "c1", project: "C", updatedAt: "2026-10-28T07:00:00+09:00" }),
  ];
  const projects = [{ project: "C", starred: true, pinned: false }];

  it("プロジェクトごとにまとめ、最新のページ順に並ぶ", () => {
    const groups = groupByProject(pages, projects);
    expect(groups.map((g) => g.project)).toEqual(["A", "C", "B"]);
    expect(groups[0]?.pages.map((p) => p.slug)).toEqual(["a1", "a2"]);
    expect(groups[0]?.unread).toBe(1);
    expect(groups[1]?.starred).toBe(true);
  });

  it("グループの最新日時で日付の段に振り分ける", () => {
    const sections = sectionize(groupByProject(pages, projects), now);
    expect(sections.map((s) => [s.bucket.label, s.groups.map((g) => g.project)])).toEqual([
      ["今日", ["A", "C"]],
      ["昨日", ["B"]],
    ]);
  });

  it("スター段にはスター付きプロジェクト全体と、スター付きページだけを出す", () => {
    const starred = starredGroups(groupByProject(pages, projects));
    expect(starred.map((g) => [g.project, g.pages.map((p) => p.slug)])).toEqual([
      ["A", ["a2"]],
      ["C", ["c1"]],
    ]);
  });
});

describe("matchesQuery", () => {
  it("複数語は AND で、タイトル・プロジェクト・パスを横断して探す", () => {
    const p = page({ slug: "weekly", title: "週次レポート", project: "デモ案件", source: "~/work/reports/weekly.html", updatedAt: "2026-10-28T00:00:00Z" });
    expect(matchesQuery(p, "週次")).toBe(true);
    expect(matchesQuery(p, "デモ レポート")).toBe(true);
    expect(matchesQuery(p, "reports")).toBe(true);
    expect(matchesQuery(p, "月次")).toBe(false);
    expect(matchesQuery(p, "   ")).toBe(true);
  });
});
