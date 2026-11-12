/**
 * Tokens with character offsets, and a conservative English stemmer.
 *
 * The stemmer only folds inflections (plural, possessive, -ing, -ed). Two different words never share a stem unless
 * they are forms of the same word, so a question cannot pass the guard by borrowing a word the witness did not use.
 */

export interface Token {
  /** The token exactly as written. */
  text: string;
  /** Lower case, with typographic apostrophes folded to ASCII. */
  lower: string;
  stem: string;
  start: number;
  end: number;
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;
const VOWEL = /[aeiouy]/;

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(WORD)) {
    const raw = m[0];
    const lower = raw.toLowerCase().replace(/’/g, "'");
    const start = m.index;
    tokens.push({ text: raw, lower, stem: stem(lower), start, end: start + raw.length });
  }
  return tokens;
}

function undouble(w: string): string {
  const n = w.length;
  if (n >= 3 && w[n - 1] === w[n - 2] && !"lsz".includes(w[n - 1]!) && !VOWEL.test(w[n - 1]!)) return w.slice(0, -1);
  return w;
}

/** Folds inflections of an English word. Input is expected in lower case. */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/’/g, "'");
  if (/^\p{N}+$/u.test(w)) return w;
  w = w.replace(/'s$/, "").replace(/s'$/, "s");
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("sses")) return w.slice(0, -2);
  if (w.endsWith("ing") && w.length >= 6 && VOWEL.test(w.slice(0, -3))) return undouble(w.slice(0, -3));
  if (w.endsWith("ied") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("ed") && !w.endsWith("eed") && w.length >= 5 && VOWEL.test(w.slice(0, -2))) return undouble(w.slice(0, -2));
  if (w.endsWith("es") && /(ch|sh|x|z|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !/(ss|us|is|ous)$/.test(w)) return w.slice(0, -1);
  return w;
}

/** Collapses runs of whitespace, trims, and folds typographic quotes, for verbatim comparison. */
export function normalize(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
