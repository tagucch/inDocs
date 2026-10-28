import { describe, expect, it } from "vitest";
import { extractTitle } from "../src/worker/lib/html";

describe("extractTitle", () => {
  it("title を優先し、なければ h1、実体参照とタグを除く", () => {
    expect(extractTitle("<html><head><title> A &amp; B </title></head><body><h1>H</h1></body></html>")).toBe("A & B");
    expect(extractTitle("<body><h1>見出し <em>強調</em></h1></body>")).toBe("見出し 強調");
    expect(extractTitle("<body><p>本文だけ</p></body>")).toBeNull();
    expect(extractTitle("<title></title><h1>fallback</h1>")).toBe("fallback");
  });
});
