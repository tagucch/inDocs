const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) return String.fromCodePoint(parseInt(body.slice(2), 16));
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
