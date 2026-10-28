import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { bundleHtml } from "../src/bundle.ts";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "indocs-bundle-"));
  await mkdir(path.join(dir, "img"), { recursive: true });
  await mkdir(path.join(dir, "css"), { recursive: true });
  await writeFile(path.join(dir, "img", "logo.png"), PNG);
  await writeFile(path.join(dir, "css", "site.css"), "h1{background:url(../img/logo.png)}");
  await writeFile(path.join(dir, "app.js"), "console.log('</script>')");
  await writeFile(path.join(os.tmpdir(), "indocs-outside.png"), PNG);
  await symlink(path.join(os.tmpdir(), "indocs-outside.png"), path.join(dir, "img", "link.png"));
});

describe("bundleHtml", () => {
  it("同じフォルダ配下の画像・CSS・JS を埋め込む", async () => {
    const html = `<html><head><link rel="stylesheet" href="css/site.css"><script src="app.js"></script></head>
<body><img src="img/logo.png"><div style="background:url('img/logo.png')"></div><a href="img/logo.png">link</a></body></html>`;
    const result = await bundleHtml(html, path.join(dir, "index.html"));
    expect(result.html).toContain('<img src="data:image/png;base64,');
    expect(result.html).toContain("<style>h1{background:url(data:image/png;base64,");
    expect(result.html).toContain("console.log('<\\/script>')");
    expect(result.html).toContain("style=\"background:url('data:image/png;base64,");
    expect(result.html).toContain('<a href="img/logo.png">');
    expect(result.embedded).toEqual(["app.js", "css/site.css", "img/logo.png"]);
    expect(result.skipped).toEqual([]);
  });

  it("リモート参照・data URL・フォルダ外のシンボリックリンク・存在しないファイルは埋め込まない", async () => {
    const html = `<img src="https://example.com/a.png"><img src="data:image/png;base64,AAAA"><img src="img/link.png"><img src="img/none.png"><img src="/abs.png">`;
    const result = await bundleHtml(html, path.join(dir, "index.html"));
    expect(result.html).toContain('src="https://example.com/a.png"');
    expect(result.html).toContain('src="data:image/png;base64,AAAA"');
    expect(result.html).toContain('src="img/link.png"');
    expect(result.html).toContain('src="/abs.png"');
    expect(result.embedded).toEqual([]);
    expect(result.skipped.map((s) => s.ref)).toEqual(["img/link.png", "img/none.png"]);
  });
});
