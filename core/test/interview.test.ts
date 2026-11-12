import { describe, expect, it } from "vitest";
import {
  answer,
  ask,
  currentPhase,
  currentTurn,
  decide,
  followupPrompt,
  GENERIC_TEMPLATE,
  MAX_FOLLOWUPS,
  newSession,
  nextPhase,
  parseProposal,
  PHASES,
  phaseIndex,
  wantsFollowup,
  witnessSegments,
  type Session,
} from "../src/interview.js";
import { checkQuestion, indexWitness } from "../src/guard.js";

const ACCOUNT =
  "I was waiting at the crossing by the bakery when a dark estate car came round the corner too fast. There was a sticker on the rear window, white, maybe round.";

function started(): Session {
  return answer(newSession("on_device", "2026-11-12T18:52:00.000Z"), ACCOUNT);
}

describe("the script", () => {
  it("has the five phases in the order of the Self-Administered Interview", () => {
    expect(PHASES.map((p) => p.id)).toEqual(["event", "people", "vehicles", "sequence", "surroundings"]);
  });

  it("opens every phase with fixed text, never with a model's words", () => {
    let s: Session | null = newSession("templates", "2026-11-12T18:52:00.000Z");
    const seen: string[] = [];
    while (s) {
      expect(currentTurn(s).prompt).toMatchObject({ kind: "opening", source: "script" });
      seen.push(currentTurn(s).prompt.text);
      s = nextPhase(answer(s, "Something I saw."));
    }
    expect(seen).toEqual(PHASES.map((p) => p.opening));
  });

  it("ends after the last phase", () => {
    let s: Session = newSession("templates", "2026-11-12T18:52:00.000Z");
    for (let i = 0; i < PHASES.length - 1; i++) s = nextPhase(answer(s, "Text."))!;
    expect(phaseIndex(s)).toBe(PHASES.length - 1);
    expect(nextPhase(s)).toBeNull();
  });

  it("drops an unanswered follow-up when the witness moves on", () => {
    const s = ask(started(), { text: GENERIC_TEMPLATE, kind: "followup", source: "template", links: [], rejected: [] });
    const next = nextPhase(s)!;
    expect(next.phases[0]!.turns).toHaveLength(1);
    expect(currentPhase(next).id).toBe("people");
  });
});

describe("when to ask a follow-up", () => {
  it("asks after an answer of four words or more", () => {
    expect(wantsFollowup(started())).toBe(true);
  });

  it("does not ask after an empty or very short answer", () => {
    expect(wantsFollowup(newSession("on_device", "t"))).toBe(false);
    expect(wantsFollowup(answer(newSession("on_device", "t"), "No idea."))).toBe(false);
  });

  it(`stops after ${MAX_FOLLOWUPS} follow-ups in a phase`, () => {
    let s = started();
    for (let i = 0; i < MAX_FOLLOWUPS; i++) {
      s = answer(ask(s, { text: GENERIC_TEMPLATE, kind: "followup", source: "template", links: [], rejected: [] }), "The sticker was round and white.");
    }
    expect(wantsFollowup(s)).toBe(false);
  });
});

describe("the model's request", () => {
  it("carries the witness's words and every question already asked", () => {
    const p = followupPrompt(started());
    expect(p).toContain(ACCOUNT);
    expect(p).toContain(PHASES[0]!.opening);
    expect(p).toContain("What happened");
  });

  it("never counts a question as the witness's words", () => {
    expect(witnessSegments(started())).toEqual([ACCOUNT]);
  });
});

describe("parsing a proposal", () => {
  it("reads JSON, even with text around it", () => {
    expect(parseProposal('Sure: {"anchor": "a sticker", "question": "Tell me about the sticker."}')).toEqual({
      anchor: "a sticker",
      question: "Tell me about the sticker.",
    });
  });

  it.each(["", "no json here", '{"anchor": 3, "question": "x"}', "{broken"])("returns null for %j", (raw) => {
    expect(parseProposal(raw)).toBeNull();
  });
});

describe("deciding what the witness sees", () => {
  it("shows an accepted proposal, labelled with where it ran, with its links", () => {
    const d = decide(started(), { anchor: "a sticker", question: "You said there was a sticker on the rear window. Tell me everything you remember about it." }, "on_device");
    expect(d.prompt.source).toBe("on_device");
    expect(d.prompt.links.map((l) => l.question.text)).toEqual(["sticker on the rear window"]);
    expect(d.prompt.rejected).toEqual([]);
  });

  it("refuses a leading proposal and reuses its anchor when the anchor is the witness's exact words", () => {
    const d = decide(started(), { anchor: "a sticker", question: "Was the sticker a parking permit?" }, "in_cloud");
    expect(d.prompt.source).toBe("template");
    expect(d.prompt.text).toBe("You said “a sticker”. Tell me everything you remember about that.");
    expect(d.prompt.rejected).toEqual([{ question: "Was the sticker a parking permit?", reasons: ["closed_form", "foreign_words"], foreign: ["parking", "permit"] }]);
  });

  it("falls back to the generic question when the anchor was invented", () => {
    const d = decide(started(), { anchor: "the parking permit", question: "Describe the parking permit." }, "on_device");
    expect(d.prompt.text).toBe(GENERIC_TEMPLATE);
    expect(d.prompt.rejected).toHaveLength(1);
  });

  it("refuses an anchor longer than six words", () => {
    const d = decide(started(), { anchor: "a dark estate car came round the corner", question: "Was it fast?" }, "on_device");
    expect(d.prompt.text).toBe(GENERIC_TEMPLATE);
  });

  it("uses the generic question when the model returned nothing usable", () => {
    expect(decide(started(), null, "on_device").prompt).toMatchObject({ text: GENERIC_TEMPLATE, source: "template", rejected: [] });
  });

  it("only ever shows a question the guard accepts", () => {
    const proposals = [
      { anchor: "a sticker", question: "Was it a parking permit?" },
      { anchor: "rear window", question: "What colour was the window?" },
      { anchor: "invented", question: "Tell me about the gun." },
      { anchor: "dark estate car", question: "Tell me about the dark estate car." },
    ];
    const s = started();
    for (const p of proposals) {
      const shown = decide(s, p, "on_device").prompt.text;
      expect(checkQuestion(shown, indexWitness(witnessSegments(s))).ok).toBe(true);
    }
  });
});
