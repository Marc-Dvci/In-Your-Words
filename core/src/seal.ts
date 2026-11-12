/**
 * The seal: a SHA-256 fingerprint of the whole interview (every question asked and every answer given), in a
 * canonical form both platforms compute byte for byte. Only this fingerprint leaves the device.
 */

import type { Session } from "./interview.js";

export interface SealedAccount {
  v: 1;
  startedAt: string;
  mode: Session["mode"];
  phases: { id: string; turns: { question: string; source: string; answer: string }[] }[];
}

export function sealable(session: Session): SealedAccount {
  return {
    v: 1,
    startedAt: session.startedAt,
    mode: session.mode,
    phases: session.phases.map((p) => ({
      id: p.id,
      turns: p.turns.filter((t) => t.answer.trim().length > 0).map((t) => ({ question: t.prompt.text, source: t.prompt.source, answer: t.answer })),
    })),
  };
}

/** JSON with object keys sorted at every level and no insignificant whitespace (RFC 8785 style for this shape). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function fingerprint(account: SealedAccount): Promise<string> {
  return sha256Hex(canonicalJson(account));
}

/** The fingerprint in groups of four, four groups to a line, as printed under the seal. */
export function groupHex(hex: string): string[] {
  const groups = hex.match(/.{1,4}/g) ?? [];
  const lines: string[] = [];
  for (let i = 0; i < groups.length; i += 4) lines.push(groups.slice(i, i + 4).join(" "));
  return lines;
}

/** A passport-style machine-readable line for the seal: IYW<<SEALED<<time<<first 24 hex digits. */
export function mrzLine(hex: string, sealedAt: Date): string {
  const t = sealedAt
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  return `IYW<<SEALED<<${t}<<${hex.slice(0, 24).toUpperCase()}`.padEnd(64, "<");
}

export const HEX64 = /^[0-9a-f]{64}$/;
