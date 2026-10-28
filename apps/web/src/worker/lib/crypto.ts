const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function fromBase64url(text: string): Uint8Array {
  const padded = text.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Base64url(text: string): Promise<string> {
  return base64url(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function sign(secret: string, data: string): Promise<string> {
  const key = await hmacKey(secret);
  return base64url(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

export async function verify(secret: string, data: string, signature: string): Promise<boolean> {
  const key = await hmacKey(secret);
  try {
    return await crypto.subtle.verify("HMAC", key, fromBase64url(signature), encoder.encode(data));
  } catch {
    return false;
  }
}

export async function sealJson(secret: string, value: unknown): Promise<string> {
  const body = base64url(encoder.encode(JSON.stringify(value)));
  return `${body}.${await sign(secret, body)}`;
}

export async function openJson<T>(secret: string, sealed: string | undefined): Promise<T | null> {
  if (!sealed) return null;
  const dot = sealed.lastIndexOf(".");
  if (dot < 0) return null;
  const body = sealed.slice(0, dot);
  if (!(await verify(secret, body, sealed.slice(dot + 1)))) return null;
  try {
    return JSON.parse(decoder.decode(fromBase64url(body))) as T;
  } catch {
    return null;
  }
}

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function pairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((b) => PAIRING_ALPHABET[b % PAIRING_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export function normalizePairingCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}
