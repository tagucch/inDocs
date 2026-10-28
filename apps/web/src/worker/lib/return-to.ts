const PLACEHOLDER = "https://placeholder.invalid";

function isSameOriginPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");
}

export function safeReturnTo(value: string | undefined): string {
  if (!value || /[\u0000-\u001f\u007f\\]/.test(value)) return "/";
  if (!isSameOriginPath(value)) return "/";
  try {
    const url = new URL(value, PLACEHOLDER);
    if (url.origin !== PLACEHOLDER) return "/";
    const normalized = `${url.pathname}${url.search}${url.hash}`;
    return isSameOriginPath(normalized) ? normalized : "/";
  } catch {
    return "/";
  }
}
