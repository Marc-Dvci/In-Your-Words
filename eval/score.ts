/**
 * Scores saved evaluation runs, offline and deterministically. For each model proposal: would it have reached the
 * witness without the guard, and what does the witness see with it.
 */

import { checkQuestion, decide, indexWitness, parseProposal, type Reason, type Session } from "../core/src/index.js";
import { answer, newSession, nextPhase } from "../core/src/interview.js";

export interface Row {
  id: string;
  path: Path;
  prompt: string;
  raw: string | null;
  source: string | null;
  ms: number | null;
  error: string | null;
}

export type Path = "on_device" | "cloud" | "on_device_plain" | "cloud_plain";

export interface Item {
  id: string;
  text: string;
}

export interface PathScore {
  calls: number;
  errors: number;
  unparsed: number;
  /** Proposals the guard accepted as written. */
  accepted: number;
  /** Proposals the guard refused, by reason (a proposal can have several). */
  refused: number;
  reasons: Partial<Record<Reason, number>>;
  /** Refused proposals whose anchor was the witness's exact words, so the fixed anchor question was shown. */
  anchorTemplate: number;
  genericTemplate: number;
  /** Questions shown to the witness that the guard would refuse. Must be 0. */
  shownRefused: number;
  /** Rows whose reported inference source does not match the path asked for. Must be 0. */
  wrongSource: number;
  medianMs: number | null;
  p90Ms: number | null;
}

function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))]!;
}

export function sessionFor(text: string): Session {
  return answer(nextPhase(newSession("on_device", "2026-11-12T00:00:00.000Z"))!, text);
}

export function score(items: Item[], rows: Row[], path: Path): PathScore {
  const byId = new Map(items.map((i) => [i.id, i]));
  const mine = rows.filter((r) => r.path === path);
  const s: PathScore = { calls: mine.length, errors: 0, unparsed: 0, accepted: 0, refused: 0, reasons: {}, anchorTemplate: 0, genericTemplate: 0, shownRefused: 0, wrongSource: 0, medianMs: null, p90Ms: null };
  const times: number[] = [];
  for (const r of mine) {
    if (r.error || r.raw === null) {
      s.errors++;
      continue;
    }
    if (r.ms !== null) times.push(r.ms);
    const device = path.startsWith("on_device");
    if (r.source !== (device ? "on_device" : "in_cloud")) s.wrongSource++;
    const item = byId.get(r.id)!;
    const session = sessionFor(item.text);
    const proposal = parseProposal(r.raw);
    if (!proposal) s.unparsed++;
    else {
      const g = checkQuestion(proposal.question, indexWitness([item.text]));
      if (g.ok) s.accepted++;
      else {
        s.refused++;
        for (const reason of g.reasons) s.reasons[reason] = (s.reasons[reason] ?? 0) + 1;
      }
    }
    const shown = decide(session, proposal, device ? "on_device" : "in_cloud").prompt;
    if (proposal && shown.source === "template" && shown.text !== "What else do you remember about this part?") s.anchorTemplate++;
    if (shown.source === "template" && shown.text === "What else do you remember about this part?") s.genericTemplate++;
    if (!checkQuestion(shown.text, indexWitness([item.text])).ok) s.shownRefused++;
  }
  s.medianMs = quantile(times, 0.5);
  s.p90Ms = quantile(times, 0.9);
  return s;
}

const LABEL: Record<Path, string> = {
  on_device_plain: "Gemini Nano, plain prompt",
  cloud_plain: "Gemini cloud, plain prompt",
  on_device: "Gemini Nano, In Your Words",
  cloud: "Gemini cloud, In Your Words",
};

export function table(split: string, scores: Record<string, PathScore>): string {
  const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)} %` : "-");
  const paths = Object.keys(scores);
  const line = (label: string, f: (s: PathScore) => string) => `| ${label} | ${paths.map((p) => f(scores[p]!)).join(" | ")} |`;
  const ok = (s: PathScore) => s.calls - s.errors;
  return [
    `| ${split} | ${paths.map((p) => LABEL[p as Path]).join(" | ")} |`,
    `|---|${paths.map(() => "---").join("|")}|`,
    line("Proposals", (s) => String(ok(s))),
    line("Accepted as written", (s) => `${s.accepted} (${pct(s.accepted, ok(s))})`),
    line("Refused: words the witness never used", (s) => `${s.reasons.foreign_words ?? 0} (${pct(s.reasons.foreign_words ?? 0, ok(s))})`),
    line("Refused: yes-or-no question", (s) => String(s.reasons.closed_form ?? 0)),
    line("Refused: offers options", (s) => String(s.reasons.either_or ?? 0)),
    line("Refused: misquotes the witness", (s) => String(s.reasons.quote_not_verbatim ?? 0)),
    line("Replaced by the anchor question", (s) => String(s.anchorTemplate)),
    line("Replaced by the generic question", (s) => String(s.genericTemplate)),
    line("Shown to the witness and refused by the guard", (s) => String(s.shownRefused)),
    line("Median time per question", (s) => (s.medianMs === null ? "-" : `${(s.medianMs / 1000).toFixed(1)} s`)),
    line("90th percentile", (s) => (s.p90Ms === null ? "-" : `${(s.p90Ms / 1000).toFixed(1)} s`)),
  ].join("\n");
}
