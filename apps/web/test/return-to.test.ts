import { describe, expect, it } from "vitest";
import { safeReturnTo } from "../src/worker/lib/return-to";

describe("safeReturnTo", () => {
  it("同一オリジンのパスだけをそのまま返す", () => {
    expect(safeReturnTo("/")).toBe("/");
    expect(safeReturnTo("/inbox")).toBe("/inbox");
    expect(safeReturnTo("/p/weekly-report?x=1#top")).toBe("/p/weekly-report?x=1#top");
    expect(safeReturnTo("/view/%E9%80%B1%E6%AC%A1")).toBe("/view/%E9%80%B1%E6%AC%A1");
  });

  it("外部へ飛ぶ値はすべてトップに戻す", () => {
    expect(safeReturnTo(undefined)).toBe("/");
    expect(safeReturnTo("")).toBe("/");
    expect(safeReturnTo("https://evil.example/")).toBe("/");
    expect(safeReturnTo("//evil.example/")).toBe("/");
    expect(safeReturnTo("/\\evil.example")).toBe("/");
    expect(safeReturnTo("/\t/evil.example")).toBe("/");
    expect(safeReturnTo("/\n/evil.example")).toBe("/");
    expect(safeReturnTo("/\u0000/evil.example")).toBe("/");
    expect(safeReturnTo("/a\\b")).toBe("/");
    expect(safeReturnTo("javascript:alert(1)")).toBe("/");
    expect(safeReturnTo("inbox")).toBe("/");
  });
});
