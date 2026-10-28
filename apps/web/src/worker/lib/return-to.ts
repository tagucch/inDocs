const PLACEHOLDER = "https://placeholder.invalid";

export function safeReturnTo(value: string | undefined): string {
  if (!value || /[\u0000-\u001f\u007f\\]/.test(value)) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, PLACEHOLDER);
    if (url.origin !== PLACEHOLDER) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
