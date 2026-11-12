/**
 * The interview script and its state. Openings are fixed text in the order of the Self-Administered Interview.
 * Follow-ups are proposed by a model, checked by the guard, and replaced by a template when refused.
 */

import { checkQuestion, indexWitness, type GuardResult, type Link, type Reason } from "./guard.js";
import { normalize, tokenize } from "./text.js";

export type PhaseId = "event" | "people" | "vehicles" | "sequence" | "surroundings";

export interface Phase {
  id: PhaseId;
  title: string;
  opening: string;
}

export const PHASES: readonly Phase[] = [
  {
    id: "event",
    title: "What happened",
    opening:
      "In your own words, tell me everything you remember about what happened. Include every detail, even ones that seem small or unimportant.",
  },
  {
    id: "people",
    title: "People",
    opening: "Tell me about each person you saw. Describe them in as much detail as you can.",
  },
  {
    id: "vehicles",
    title: "Vehicles",
    opening: "Tell me about any vehicle you saw. Describe it in as much detail as you can.",
  },
  {
    id: "sequence",
    title: "Order of events",
    opening: "Now go through what happened in a different order: start from the end, and work back to the beginning.",
  },
  {
    id: "surroundings",
    title: "Surroundings",
    opening:
      "Picture the place again. Tell me where you were, what you could see and hear around you, and anyone else who was there.",
  },
];

/** Where a prompt's text came from. */
export type PromptSource = "script" | "on_device" | "in_cloud" | "template";

export interface Rejected {
  question: string;
  reasons: Reason[];
  foreign: string[];
}

export interface Prompt {
  text: string;
  kind: "opening" | "followup";
  source: PromptSource;
  links: Link[];
  rejected: Rejected[];
}

export interface Turn {
  prompt: Prompt;
  answer: string;
}

export interface PhaseState {
  id: PhaseId;
  turns: Turn[];
}

/** How questions are written for this interview, chosen with the witness before it starts. */
export type Mode = "on_device" | "cloud" | "templates";

export interface Session {
  v: 1;
  startedAt: string;
  mode: Mode;
  phases: PhaseState[];
}

export const MAX_FOLLOWUPS = 2;

export function newSession(mode: Mode, startedAt: string): Session {
  return { v: 1, startedAt, mode, phases: [{ id: "event", turns: [{ prompt: opening("event"), answer: "" }] }] };
}

export function opening(id: PhaseId): Prompt {
  const phase = PHASES.find((p) => p.id === id)!;
  return { text: phase.opening, kind: "opening", source: "script", links: [], rejected: [] };
}

/** Every answer the witness has given, in order. Questions are never part of the witness's words. */
export function witnessSegments(session: Session): string[] {
  return session.phases.flatMap((p) => p.turns.map((t) => t.answer)).filter((a) => a.trim().length > 0);
}

export function currentPhase(session: Session): PhaseState {
  return session.phases[session.phases.length - 1]!;
}

export function currentTurn(session: Session): Turn {
  const phase = currentPhase(session);
  return phase.turns[phase.turns.length - 1]!;
}

export function phaseIndex(session: Session): number {
  return PHASES.findIndex((p) => p.id === currentPhase(session).id);
}

/** True when the current phase may still ask a follow-up about the last answer. */
export function wantsFollowup(session: Session, max = MAX_FOLLOWUPS): boolean {
  const phase = currentPhase(session);
  const last = phase.turns[phase.turns.length - 1]!;
  const followups = phase.turns.filter((t) => t.prompt.kind === "followup").length;
  return last.answer.trim().length > 0 && followups < max && tokenize(last.answer).length >= 4;
}

export function answer(session: Session, text: string): Session {
  const phases = session.phases.map((p) => ({ ...p, turns: [...p.turns] }));
  const phase = phases[phases.length - 1]!;
  const last = phase.turns[phase.turns.length - 1]!;
  phase.turns[phase.turns.length - 1] = { ...last, answer: text.trim() };
  return { ...session, phases };
}

export function ask(session: Session, prompt: Prompt): Session {
  const phases = session.phases.map((p) => ({ ...p, turns: [...p.turns] }));
  phases[phases.length - 1]!.turns.push({ prompt, answer: "" });
  return { ...session, phases };
}

/** Moves to the next phase, or returns null after the last one. */
export function nextPhase(session: Session): Session | null {
  const i = phaseIndex(session);
  const next = PHASES[i + 1];
  if (!next) return null;
  const phases = session.phases.map((p) => ({ ...p, turns: p.turns.filter((t) => t.answer.trim() || t.prompt.kind === "opening") }));
  phases.push({ id: next.id, turns: [{ prompt: opening(next.id), answer: "" }] });
  return { ...session, phases };
}

// ---------- follow-up generation ----------

/** The JSON a model returns for one follow-up. */
export interface Proposal {
  anchor: string;
  question: string;
}

export const PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    anchor: { type: "string", description: "A phrase of 1 to 6 words copied exactly from the witness's words." },
    question: { type: "string", description: "One open question about the anchor, using only the witness's words." },
  },
  required: ["anchor", "question"],
} as const;

export const SYSTEM_PROMPT = `You help a witness recall an event, following the cognitive interview.
Write ONE open follow-up question about something the witness said.
Rules:
- Choose an "anchor": a phrase of 1 to 6 words copied exactly from the witness's words.
- The question may use only words the witness already used, plus words like: you, said, tell, me, everything, remember, describe, about, more, else, what.
- Never add a new detail, colour, object, number, name or place.
- Never ask a yes-or-no question. Never offer options joined by "or".
- Prefer the form: You said <anchor>. Tell me everything you remember about it.
Return JSON: {"anchor": "...", "question": "..."}.`;

export function followupPrompt(session: Session): string {
  const phase = PHASES.find((p) => p.id === currentPhase(session).id)!;
  const all = witnessSegments(session);
  const last = currentTurn(session).answer;
  const asked = session.phases.flatMap((p) => p.turns.map((t) => t.prompt.text));
  return [
    `Topic of this part of the interview: ${phase.title}.`,
    `Everything the witness has said so far:\n"""\n${all.join("\n")}\n"""`,
    `The witness's last answer:\n"""\n${last}\n"""`,
    `Questions already asked (do not repeat them):\n${asked.map((q) => `- ${q}`).join("\n")}`,
    `Write the follow-up question about the last answer.`,
  ].join("\n\n");
}

export function parseProposal(raw: string): Proposal | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Partial<Proposal>;
    if (typeof o.anchor !== "string" || typeof o.question !== "string") return null;
    return { anchor: o.anchor.trim(), question: o.question.trim() };
  } catch {
    return null;
  }
}

export function anchorTemplate(anchor: string): string {
  return `You said “${anchor}”. Tell me everything you remember about that.`;
}

export const GENERIC_TEMPLATE = "What else do you remember about this part?";

export interface Decision {
  prompt: Prompt;
  guard: GuardResult | null;
}

/**
 * Turns a model proposal into the prompt the witness sees. The proposal is shown only if the guard accepts it.
 * Otherwise its anchor is reused in a fixed template when the anchor is the witness's exact words, and the
 * generic template is used when it is not. Every refused candidate is kept, so the screen can show what was
 * checked.
 */
export function decide(session: Session, proposal: Proposal | null, source: "on_device" | "in_cloud"): Decision {
  const witness = indexWitness(witnessSegments(session));
  const rejected: Rejected[] = [];
  if (proposal) {
    const g = checkQuestion(proposal.question, witness);
    if (g.ok) return { prompt: { text: g.question, kind: "followup", source, links: g.links, rejected }, guard: g };
    rejected.push({ question: g.question, reasons: g.reasons, foreign: g.foreign.map((f) => f.text) });
    const anchor = proposal.anchor.replace(/^["“]|["”]$/g, "").trim();
    const words = tokenize(anchor).length;
    if (words >= 1 && words <= 6 && witness.normalized.includes(normalize(anchor))) {
      const t = checkQuestion(anchorTemplate(anchor), witness);
      if (t.ok) return { prompt: { text: t.question, kind: "followup", source: "template", links: t.links, rejected }, guard: t };
    }
  }
  return {
    prompt: { text: GENERIC_TEMPLATE, kind: "followup", source: "template", links: [], rejected },
    guard: null,
  };
}
