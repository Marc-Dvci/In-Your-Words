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
  const links: Link[] = [];
  for (const t of tokens) {
    if (isFreeWord(t.lower)) continue;
    const isNumber = /^\p{N}+$/u.test(t.lower);
    const known = isNumber ? witness.numbers.has(t.lower) : witness.stems.has(t.stem);
    if (!known) {
      foreign.push({ text: t.text, start: t.start, end: t.end });
      continue;
    }
    const source = [...witness.tokens].reverse().find((w) => (isNumber ? w.lower === t.lower : w.stem === t.stem))!;
    links.push({
      question: { text: t.text, start: t.start, end: t.end },
      segment: source.segment,
      start: source.start,
      end: source.end,
    });
  }
  if (foreign.length) reasons.add("foreign_words");

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
