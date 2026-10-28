import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
};

export const MAX_ASSET_BYTES = 10 * 1024 * 1024;

export type Skipped = { ref: string; reason: string };
export type BundleResult = { html: string; embedded: string[]; skipped: Skipped[] };

function isRemote(ref: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref) || ref.startsWith("/");
}

type Loader = {
  root: string;
  embedded: Set<string>;
  skipped: Skipped[];
  cache: Map<string, Buffer | null>;
};

async function loadAsset(loader: Loader, baseDir: string, rawRef: string): Promise<{ data: Buffer; mime: string; file: string } | null> {
  const ref = rawRef.trim().split(/[?#]/)[0] ?? "";
  if (!ref || isRemote(rawRef.trim())) return null;
  let decoded = ref;
  try {
    decoded = decodeURIComponent(ref);
  } catch {
    decoded = ref;
  }
  const candidate = path.resolve(baseDir, decoded);
  const mime = MIME[path.extname(candidate).toLowerCase()];
  if (!mime) {
    loader.skipped.push({ ref: rawRef, reason: "対応していない拡張子" });
    return null;
  }
  let real: string;
  try {
    real = await realpath(candidate);
  } catch {
    loader.skipped.push({ ref: rawRef, reason: "ファイルが見つからない" });
    return null;
  }
  if (real !== loader.root && !real.startsWith(`${loader.root}${path.sep}`)) {
    loader.skipped.push({ ref: rawRef, reason: "HTML のあるフォルダの外なので埋め込まない" });
    return null;
  }
  const info = await stat(real);
  if (!info.isFile()) {
    loader.skipped.push({ ref: rawRef, reason: "ファイルではない" });
    return null;
  }
  if (info.size > MAX_ASSET_BYTES) {
    loader.skipped.push({ ref: rawRef, reason: `${(info.size / 1024 / 1024).toFixed(1)}MB は上限 ${MAX_ASSET_BYTES / 1024 / 1024}MB を超える` });
    return null;
  }
  let data = loader.cache.get(real);
  if (data === undefined) {
    data = await readFile(real);
    loader.cache.set(real, data);
  }
  if (!data) return null;
  loader.embedded.add(path.relative(loader.root, real) || path.basename(real));
  return { data, mime, file: real };
}

function dataUrl(mime: string, data: Buffer): string {
  return `data:${mime};base64,${data.toString("base64")}`;
}

async function inlineCssUrls(loader: Loader, css: string, baseDir: string): Promise<string> {
  const pattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  const parts: string[] = [];
  let last = 0;
  for (const match of css.matchAll(pattern)) {
    const [whole, quote, ref] = match;
    const index = match.index ?? 0;
    parts.push(css.slice(last, index));
    const asset = await loadAsset(loader, baseDir, ref ?? "");
    parts.push(asset ? `url(${quote}${dataUrl(asset.mime, asset.data)}${quote})` : whole);
    last = index + whole.length;
  }
  parts.push(css.slice(last));
  return parts.join("");
}

async function replaceAsync(input: string, pattern: RegExp, replacer: (match: RegExpMatchArray) => Promise<string>): Promise<string> {
  const parts: string[] = [];
  let last = 0;
  for (const match of input.matchAll(pattern)) {
    const index = match.index ?? 0;
    parts.push(input.slice(last, index));
    parts.push(await replacer(match));
    last = index + match[0].length;
  }
  parts.push(input.slice(last));
  return parts.join("");
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

function setAttr(tag: string, name: string, value: string): string {
  return tag.replace(new RegExp(`(\\s${name}\\s*=\\s*)(?:"[^"]*"|'[^']*'|[^\\s>]+)`, "i"), `$1"${value}"`);
}

export async function bundleHtml(html: string, htmlPath: string): Promise<BundleResult> {
  const baseDir = path.dirname(path.resolve(htmlPath));
  const loader: Loader = { root: await realpath(baseDir), embedded: new Set(), skipped: [], cache: new Map() };

  let out = await replaceAsync(html, /<link\b[^>]*>/gi, async (match) => {
    const tag = match[0];
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    const href = attr(tag, "href");
    if (!href || isRemote(href)) return tag;
    if (rel.split(/\s+/).includes("stylesheet")) {
      const asset = await loadAsset(loader, baseDir, href);
      if (!asset) return tag;
      const css = await inlineCssUrls(loader, asset.data.toString("utf8"), path.dirname(asset.file));
      return `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
    }
    if (rel.includes("icon")) {
      const asset = await loadAsset(loader, baseDir, href);
      return asset ? setAttr(tag, "href", dataUrl(asset.mime, asset.data)) : tag;
    }
    return tag;
  });

  out = await replaceAsync(out, /<script\b[^>]*\ssrc\s*=[^>]*>\s*<\/script>/gi, async (match) => {
    const tag = match[0];
    const src = attr(tag, "src");
    if (!src || isRemote(src)) return tag;
    const asset = await loadAsset(loader, baseDir, src);
    if (!asset) return tag;
    const open = tag.slice(0, tag.indexOf(">") + 1).replace(/\ssrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "");
    return `${open}\n${asset.data.toString("utf8").replace(/<\/script/gi, "<\\/script")}\n</script>`;
  });

  out = await replaceAsync(out, /<(?:img|source|video|audio|track|embed|input)\b[^>]*>/gi, async (match) => {
    let tag = match[0];
    for (const name of ["src", "poster"]) {
      const value = attr(tag, name);
      if (!value || isRemote(value)) continue;
      const asset = await loadAsset(loader, baseDir, value);
      if (asset) tag = setAttr(tag, name, dataUrl(asset.mime, asset.data));
    }
    if (attr(tag, "srcset")) loader.skipped.push({ ref: attr(tag, "srcset") ?? "", reason: "srcset は埋め込まない" });
    return tag;
  });

  out = await replaceAsync(out, /<object\b[^>]*>/gi, async (match) => {
    const tag = match[0];
    const data = attr(tag, "data");
    if (!data || isRemote(data)) return tag;
    const asset = await loadAsset(loader, baseDir, data);
    return asset ? setAttr(tag, "data", dataUrl(asset.mime, asset.data)) : tag;
  });

  out = await replaceAsync(out, /<style\b[^>]*>([\s\S]*?)<\/style>/gi, async (match) => {
    const css = match[1] ?? "";
    const inlined = await inlineCssUrls(loader, css, baseDir);
    return inlined === css ? match[0] : match[0].replace(css, inlined);
  });

  out = await replaceAsync(out, /\sstyle\s*=\s*"([^"]*url\([^"]*)"/gi, async (match) => {
    const css = match[1] ?? "";
    const inlined = await inlineCssUrls(loader, css, baseDir);
    return match[0].replace(css, inlined);
  });

  return { html: out, embedded: [...loader.embedded].sort(), skipped: loader.skipped };
}
