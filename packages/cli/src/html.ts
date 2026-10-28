const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (/^#x/i.test(body)) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function textOf(html: string, pattern: RegExp): string | null {
  const match = pattern.exec(html);
  if (!match?.[1]) return null;
  const text = decodeEntities(match[1].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  return text || null;
}

export function extractTitle(html: string): string | null {
  return textOf(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? textOf(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
}

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

export function shortHash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}
