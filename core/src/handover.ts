/**
 * Continue on another device. The account travels encrypted: the first device draws a 100-bit code, derives a
 * record id and an AES-GCM key from it with HKDF-SHA-256, and stores only ciphertext. The witness types the code on
 * the second device, which derives the same id and key. The server never sees the code or the words.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32, no I L O U

export const CODE_CHARS = 20;

export function newCode(random: (n: number) => Uint8Array = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(CODE_CHARS);
  return [...bytes].map((b) => ALPHABET[b % 32]).join("");
}

/** Normalizes what a person typed: case, spaces, dashes, and the letters Crockford reads as digits. */
export function cleanCode(typed: string): string | null {
  const c = typed.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  if (c.length !== CODE_CHARS || [...c].some((ch) => !ALPHABET.includes(ch))) return null;
  return c;
}

export function formatCode(code: string): string {
  return code.match(/.{1,4}/g)!.join("-");
}

async function hkdf(code: string, info: string, bits: number): Promise<ArrayBuffer> {
  const subtle = globalThis.crypto.subtle;
  const base = await subtle.importKey("raw", new TextEncoder().encode(code), "HKDF", false, ["deriveBits"]);
  return subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("in-your-words/handover/v1"), info: new TextEncoder().encode(info) },
    base,
    bits,
  );
}

export async function recordId(code: string): Promise<string> {
  const bits = new Uint8Array(await hkdf(code, "record-id", 128));
  return [...bits].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function aesKey(code: string): Promise<CryptoKey> {
  const raw = await hkdf(code, "aes-gcm-key", 256);
  return globalThis.crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const b64 = (u: Uint8Array): string => btoa(String.fromCharCode(...u));
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export interface Sealed {
  iv: string;
  ct: string;
}

export async function encrypt(code: string, plain: string): Promise<Sealed> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(code), new TextEncoder().encode(plain));
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

export async function decrypt(code: string, box: Sealed): Promise<string> {
  const plain = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, await aesKey(code), unb64(box.ct));
  return new TextDecoder().decode(plain);
}
