/**
 * Trace-to-quote: a drafted statement sentence survives only if every quote it cites is the witness's exact words,
 * and every content word of the sentence comes from those quotes. Sentences that fail are dropped, and the screen
 * says how many.
 */

import { normalize, tokenize } from "./text.js";
import { FUNCTION_WORDS } from "./words.js";

export interface DraftSentence {
  text: string;
  quotes: string[];
}

export interface TracedSentence {
  text: string;
  /** Character ranges of each quote in the account text. */
  sources: { start: number; end: number }[];
}

export interface TraceResult {
  kept: TracedSentence[];
  dropped: { text: string; why: "quote_not_found" | "words_not_in_quotes" | "no_quotes" }[];
}

export const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    sentences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          quotes: { type: "array", items: { type: "string" } },
        },
        required: ["text", "quotes"],
      },
    },
  },
  required: ["sentences"],
} as const;

export const DRAFT_SYSTEM = `You turn a witness's interview answers into a first-person witness statement.
Rules:
- Use the witness's own words. Do not add any fact, word, colour, number, time, name or place they did not say.
- Keep their uncertainty ("I think", "maybe") exactly as they said it.
- For every sentence, list in "quotes" the exact fragments of their answers it comes from, copied character for character.
- Order the sentences as the events happened, following their answers.
Return JSON: {"sentences": [{"text": "...", "quotes": ["..."]}]}.`;

function findQuote(account: string, quote: string): { start: number; end: number } | null {
  const q = normalize(quote).replace(/^["']|["']$/g, "");
  if (!q) return null;
  // Map normalized positions back to the original text.
  const map: number[] = [];
  let norm = "";
  let prevSpace = true;
  for (let i = 0; i < account.length; i++) {
    let ch = account[i]!;
    if (/\s/.test(ch)) {
      if (prevSpace) continue;
      ch = " ";
      prevSpace = true;
    } else prevSpace = false;
    ch = ch.replace(/[‘’]/, "'").replace(/[“”]/, '"').toLowerCase();
    norm += ch;
    map.push(i);
  }
  const at = norm.indexOf(q);
  if (at < 0) return null;
  return { start: map[at]!, end: map[at + q.length - 1]! + 1 };
}

export function trace(account: string, draft: DraftSentence[]): TraceResult {
  const kept: TracedSentence[] = [];
  const dropped: TraceResult["dropped"] = [];
  for (const s of draft) {
    if (!s.quotes.length) {
      dropped.push({ text: s.text, why: "no_quotes" });
      continue;
    }
    const sources = s.quotes.map((q) => findQuote(account, q));
    if (sources.some((x) => x === null)) {
      dropped.push({ text: s.text, why: "quote_not_found" });
      continue;
    }
    const allowed = new Set(s.quotes.flatMap((q) => tokenize(q).map((t) => t.stem)));
    const ok = tokenize(s.text).every((t) => FUNCTION_WORDS.has(t.lower) || allowed.has(t.stem));
    if (!ok) {
      dropped.push({ text: s.text, why: "words_not_in_quotes" });
      continue;
    }
    kept.push({ text: s.text, sources: sources as { start: number; end: number }[] });
  }
  return { kept, dropped };
}
