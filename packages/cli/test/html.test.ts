import { describe, expect, it } from "vitest";
import { extractTitle, shortHash, slugify } from "../src/html.ts";

describe("slugify", () => {
  it("英数字以外をハイフンにし、日本語だけなら空になる", () => {
    expect(slugify("Weekly Report 10/28")).toBe("weekly-report-10-28");
    expect(slugify("  Résumé_2026  ")).toBe("resume-2026");
    expect(slugify("週次レポート")).toBe("");
    expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(80);
  });
});

describe("shortHash", () => {
  it("同じ入力で同じ 7 文字を返す", () => {
    expect(shortHash("/path/to/file.html")).toBe(shortHash("/path/to/file.html"));
    expect(shortHash("a")).not.toBe(shortHash("b"));
    expect(shortHash("x")).toHaveLength(7);
  });
});

describe("extractTitle", () => {
  it("title → h1 の順に探す", () => {
    expect(extractTitle("<title>T</title><h1>H</h1>")).toBe("T");
    expect(extractTitle("<h1>H</h1>")).toBe("H");
  });
});
