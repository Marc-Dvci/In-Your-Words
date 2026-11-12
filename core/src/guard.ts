/**
 * The non-leading guard. A follow-up question reaches the witness only if every content word in it is a word the
 * witness already used, and it is an open question. Everything here is deterministic: the model proposes, this
 * module decides.
 */

import { normalize, tokenize, type Token } from "./text.js";
import { CLOSED_OPENERS, IMPERATIVE_OPENERS, isFreeWord } from "./words.js";

/** The witness's own words: one entry per answer, in the order given. */
export interface WitnessIndex {
  segments: readonly string[];
  tokens: readonly (Token & { segment: number })[];
  stems: ReadonlySet<string>;
  numbers: ReadonlySet<string>;
  normalized: string;
}

export function indexWitness(segments: readonly string[]): WitnessIndex {
  const tokens = segments.flatMap((s, segment) => tokenize(s).map((t) => ({ ...t, segment })));
  return {
    segments,
    tokens,
    stems: new Set(tokens.map((t) => t.stem)),
    numbers: new Set(tokens.filter((t) => /^\p{N}+$/u.test(t.lower)).map((t) => t.lower)),
    normalized: segments.map(normalize).join(" \u0000 "),
  };
}

export type Reason =
  | "empty"
  | "too_long"
  | "not_a_question"
  | "more_than_one_question"
  | "closed_form"
  | "either_or"
  | "foreign_words"
  | "quote_not_verbatim";

export interface Span {
  text: string;
  start: number;
  end: number;
}

/** Ties a word of the question to the place the witness said it. */
export interface Link {
  question: Span;
  segment: number;
  start: number;
  end: number;
}

export interface GuardResult {
  ok: boolean;
  question: string;
  reasons: Reason[];
  /** Content words of the question the witness never used. */
  foreign: Span[];
  links: Link[];
}

export const MAX_WORDS = 32;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function checkQuestion(question: string, witness: WitnessIndex): GuardResult {
  const q = question.replace(/\s+/g, " ").trim();
  const reasons = new Set<Reason>();
  const tokens = tokenize(q);
  if (tokens.length === 0) return { ok: false, question: q, reasons: ["empty"], foreign: [], links: [] };
  if (tokens.length > MAX_WORDS) reasons.add("too_long");

  const parts = sentences(q);
  const asks = parts.filter((s) => s.endsWith("?"));
  const last = parts[parts.length - 1] ?? "";
  const lastFirst = tokenize(last)[0]?.lower ?? "";
  if (asks.length > 1 || (q.match(/\?/g)?.length ?? 0) > 1) reasons.add("more_than_one_question");
  const endsAsk = last.endsWith("?");
  const endsImperative = last.endsWith(".") && IMPERATIVE_OPENERS.has(lastFirst);
  if (!endsAsk && !endsImperative) reasons.add("not_a_question");
  for (const s of parts) {
    const first = tokenize(s)[0]?.lower ?? "";
    if (s.endsWith("?") && CLOSED_OPENERS.has(first)) reasons.add("closed_form");
  }
  if (tokens.some((t) => t.lower === "or")) reasons.add("either_or");

  for (const m of q.matchAll(/["“]([^"”]+)["”]/g)) {
    if (!witness.normalized.includes(normalize(m[1]!))) reasons.add("quote_not_verbatim");
  }

  const foreign: Span[] = [];
  for (const t of tokens) {
    if (isFreeWord(t.lower)) continue;
    const isNumber = /^\p{N}+$/u.test(t.lower);
    const known = isNumber ? witness.numbers.has(t.lower) : witness.stems.has(t.stem);
    if (!known) foreign.push({ text: t.text, start: t.start, end: t.end });
  }
  if (foreign.length) reasons.add("foreign_words");
  const links = phraseLinks(q, tokens, witness);

  const ordered: Reason[] = [
    "empty",
    "too_long",
    "not_a_question",
    "more_than_one_question",
    "closed_form",
    "either_or",
    "foreign_words",
    "quote_not_verbatim",
  ];
  const list = ordered.filter((r) => reasons.has(r));
  return { ok: list.length === 0, question: q, reasons: list, foreign, links };
}

const same = (a: Token, b: Token): boolean => (/^\p{N}+$/u.test(a.lower) ? a.lower === b.lower : a.stem === b.stem);

/**
 * Links each run of the witness's words in the question to the longest matching run in the witness's account, so
 * "dark estate car came round" points at the one place it was said. Runs start and end on content words. Among
 * equally long runs, the most recent answer wins, and within it the first mention.
 */
function phraseLinks(q: string, tokens: Token[], witness: WitnessIndex): Link[] {
  const links: Link[] = [];
  const bySegment = witness.segments.map((_, s) => witness.tokens.filter((t) => t.segment === s));
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (isFreeWord(t.lower)) {
      i++;
      continue;
    }
    let best: { s: number; j: number; k: number } | null = null;
    for (let s = bySegment.length - 1; s >= 0; s--) {
      const seg = bySegment[s]!;
      for (let j = 0; j < seg.length; j++) {
        if (!same(t, seg[j]!)) continue;
        let k = 1;
        while (i + k < tokens.length && j + k < seg.length && same(tokens[i + k]!, seg[j + k]!)) k++;
        while (k > 1 && isFreeWord(tokens[i + k - 1]!.lower)) k--;
        if (!best || k > best.k) best = { s, j, k };
      }
    }
    if (!best) {
      i++;
      continue;
    }
    const seg = bySegment[best.s]!;
    const qEnd = tokens[i + best.k - 1]!.end;
    links.push({
      question: { text: q.slice(t.start, qEnd), start: t.start, end: qEnd },
      segment: best.s,
      start: seg[best.j]!.start,
      end: seg[best.j + best.k - 1]!.end,
    });
    i += best.k;
  }
  return links;
}

/** One sentence a person can read, for each reason a question was refused. */
export const REASON_TEXT: Record<Reason, string> = {
  empty: "empty",
  too_long: "too long",
  not_a_question: "not a question",
  more_than_one_question: "more than one question at once",
  closed_form: "a yes-or-no question",
  either_or: "offers a choice between options",
  foreign_words: "uses words you never said",
  quote_not_verbatim: "quotes words you never said",
};
