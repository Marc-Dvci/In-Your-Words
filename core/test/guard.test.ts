import { readFileSync, writeFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkQuestion, indexWitness, MAX_WORDS, REASON_TEXT, type Reason } from "../src/guard.js";
import { stem, tokenize } from "../src/text.js";
import { FUNCTION_WORDS, SCAFFOLD_WORDS } from "../src/words.js";

interface Vectors {
  witness: string[];
  cases: { question: string; ok: boolean; reasons: Reason[]; foreign: string[]; links?: [string, string][] }[];
}
const file = new URL("../../spec/vectors/guard.json", import.meta.url);
const vectors = JSON.parse(readFileSync(file, "utf8")) as Vectors;
const witness = indexWitness(vectors.witness);
const linksOf = (q: string): [string, string][] =>
  checkQuestion(q, witness).links.map((l) => [l.question.text, vectors.witness[l.segment]!.slice(l.start, l.end)]);
if (process.env.UPDATE_VECTORS) {
  for (const c of vectors.cases) c.links = linksOf(c.question);
  writeFileSync(file, JSON.stringify(vectors, null, 2) + "\n");
}

describe("the shared guard vectors", () => {
  it.each(vectors.cases)("decides $question", (c) => {
    const g = checkQuestion(c.question, witness);
    expect(g.ok).toBe(c.ok);
    expect(g.reasons).toEqual(c.reasons);
    expect(g.foreign.map((f) => f.text)).toEqual(c.foreign);
    expect(linksOf(c.question)).toEqual(c.links);
  });
});

describe("provenance links", () => {
  it("ties a run of the witness's words to the place the witness said it", () => {
    const g = checkQuestion("You said there was a sticker on the rear window. Tell me everything you remember about it.", witness);
    const linked = g.links.map((l) => [l.question.text, vectors.witness[l.segment]!.slice(l.start, l.end)]);
    expect(linked).toEqual([["sticker on the rear window", "sticker on the rear window"]]);
  });

  it("links a run of the witness's words to the one place the whole run was said", () => {
    const g = checkQuestion("You said dark estate car came round. Tell me everything you remember about how it came round.", witness);
    const linked = g.links.map((l) => [l.question.text, vectors.witness[l.segment]!.slice(l.start, l.end)]);
    expect(linked).toEqual([
      ["dark estate car came round", "dark estate car came round"],
      ["came round", "came round"],
    ]);
  });

  it("never starts or ends a linked run on a function word", () => {
    const g = checkQuestion("Tell me about the car and the bridge.", witness);
    expect(g.links.map((l) => l.question.text)).toEqual(["car", "bridge"]);
  });

  it("links an inflected word to the form the witness used", () => {
    const g = checkQuestion("Tell me about the stickers.", witness);
    expect(g.links.map((l) => vectors.witness[l.segment]!.slice(l.start, l.end))).toEqual(["sticker"]);
  });

  it("links to the witness's most recent use of a word", () => {
    const w = indexWitness(["The car stopped.", "Later the car left."]);
    const g = checkQuestion("Tell me about the car.", w);
    expect(g.links[0]).toMatchObject({ segment: 1 });
  });

  it("gives no link for function and scaffold words", () => {
    const g = checkQuestion("What else do you remember about this part?", witness);
    expect(g.links).toEqual([]);
  });
});

describe("question form", () => {
  it("accepts an imperative prompt ending in a full stop", () => {
    expect(checkQuestion("Describe the cap.", witness).ok).toBe(true);
  });

  it("refuses a statement that is not an imperative", () => {
    expect(checkQuestion("The cap.", witness).reasons).toContain("not_a_question");
  });

  it("refuses a yes-or-no question in any sentence, not only the first", () => {
    expect(checkQuestion("You said cap. Was it the driver's cap?", witness).reasons).toContain("closed_form");
  });

  it(`accepts ${MAX_WORDS} words and refuses ${MAX_WORDS + 1}`, () => {
    const at = `Tell me about ${Array.from({ length: MAX_WORDS - 3 }, () => "the").join(" ")}.`;
    expect(tokenize(at)).toHaveLength(MAX_WORDS);
    expect(checkQuestion(at, witness).reasons).not.toContain("too_long");
    const over = at.replace("Tell me", "Tell me the");
    expect(checkQuestion(over, witness).reasons).toContain("too_long");
  });

  it("names every reason in words a person can read", () => {
    for (const r of Object.keys(REASON_TEXT) as Reason[]) expect(REASON_TEXT[r].length).toBeGreaterThan(3);
  });
});

describe("the lists of free words", () => {
  it("hold no word that could name a detail of an incident", () => {
    const facts = ["car", "man", "woman", "red", "blue", "knife", "gun", "tall", "short", "hat", "bag", "phone", "left", "right", "fast", "night"];
    for (const w of facts) {
      expect(FUNCTION_WORDS.has(w)).toBe(false);
      expect(SCAFFOLD_WORDS.has(w)).toBe(false);
    }
  });
});

describe("the stemmer", () => {
  it.each([
    ["stickers", "sticker"],
    ["sticker's", "sticker"],
    ["clipped", "clip"],
    ["running", "run"],
    ["slowed", "slow"],
    ["bodies", "body"],
    ["boxes", "box"],
    ["glasses", "glass"],
    ["bus", "bus"],
    ["red", "red"],
    ["speed", "speed"],
    ["2", "2"],
  ])("folds %s to %s", (word, expected) => {
    expect(stem(word)).toBe(expected);
  });

  it("never folds two different short words together", () => {
    expect(stem("cap")).not.toBe(stem("cat"));
    expect(stem("red")).not.toBe(stem("read"));
  });
});

describe("properties", () => {
  const content = [...new Set(tokenize(vectors.witness[0]!).map((t) => t.text.toLowerCase()))].filter((w) => !FUNCTION_WORDS.has(w) && !SCAFFOLD_WORDS.has(w));

  it("accepts any template question built from the witness's own content words", () => {
    fc.assert(
      fc.property(fc.subarray(content, { minLength: 1, maxLength: 4 }), (words) => {
        const q = `You said ${words.join(" ")}. Tell me everything you remember about it.`;
        expect(checkQuestion(q, witness).ok).toBe(true);
      }),
    );
  });

  it("refuses any question that adds a word the witness never used, and names that word", () => {
    const incident = ["knife", "blonde", "motorbike", "tattoo", "umbrella", "scooter", "uniform", "helmet", "pistol", "van"];
    fc.assert(
      fc.property(fc.constantFrom(...incident), fc.subarray(content, { minLength: 1, maxLength: 3 }), (extra, words) => {
        const g = checkQuestion(`Tell me about the ${extra} and the ${words.join(" ")}.`, witness);
        expect(g.ok).toBe(false);
        expect(g.foreign.map((f) => f.text)).toContain(extra);
      }),
    );
  });

  it("never throws, and refuses anything it cannot read as a question", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (s) => {
        const g = checkQuestion(s, witness);
        expect(typeof g.ok).toBe("boolean");
        if (g.ok) expect(g.question.trim().length).toBeGreaterThan(0);
      }),
    );
  });
});
