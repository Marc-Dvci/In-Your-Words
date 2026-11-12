import { describe, expect, it } from "vitest";
import { cleanCode, CODE_CHARS, decrypt, encrypt, formatCode, newCode, recordId } from "../src/handover.js";
import { trace } from "../src/trace.js";

const ACCOUNT = `I was waiting at the crossing by the bakery when a dark estate car came round the corner too fast.
I think the driver wore a cap. There was a sticker on the rear window, white, maybe round.`;

describe("trace-to-quote", () => {
  it("keeps a sentence whose words all come from its quotes, and locates each quote", () => {
    const r = trace(ACCOUNT, [{ text: "I think the driver wore a cap.", quotes: ["I think the driver wore a cap."] }]);
    expect(r.dropped).toEqual([]);
    const src = r.kept[0]!.sources[0]!;
    expect(ACCOUNT.slice(src.start, src.end)).toBe("I think the driver wore a cap.");
  });

  it("finds quotes across line breaks and typographic apostrophes", () => {
    const r = trace(ACCOUNT, [{ text: "A dark estate car came round the corner too fast.", quotes: ["a dark  estate car came round the corner too fast."] }]);
    expect(r.kept).toHaveLength(1);
  });

  it("drops a sentence that cites a quote the witness never said", () => {
    const r = trace(ACCOUNT, [{ text: "The car was a blue estate.", quotes: ["a blue estate"] }]);
    expect(r.dropped).toEqual([{ text: "The car was a blue estate.", why: "quote_not_found" }]);
  });

  it("drops a sentence that adds a word its quotes do not contain", () => {
    const r = trace(ACCOUNT, [{ text: "The driver wore a red cap.", quotes: ["the driver wore a cap"] }]);
    expect(r.dropped[0]!.why).toBe("words_not_in_quotes");
  });

  it("drops a sentence with no quotes", () => {
    expect(trace(ACCOUNT, [{ text: "I was there.", quotes: [] }]).dropped[0]!.why).toBe("no_quotes");
  });

  it("keeps the witness's uncertainty only when quoted", () => {
    const kept = trace(ACCOUNT, [{ text: "The sticker was white, maybe round.", quotes: ["sticker on the rear window, white, maybe round"] }]);
    expect(kept.kept).toHaveLength(1);
    const sure = trace(ACCOUNT, [{ text: "The sticker was round.", quotes: ["sticker"] }]);
    expect(sure.dropped).toHaveLength(1);
  });
});

describe("handover code", () => {
  it(`has ${CODE_CHARS} Crockford base32 characters`, () => {
    expect(newCode()).toMatch(new RegExp(`^[0-9A-HJKMNP-TV-Z]{${CODE_CHARS}}$`));
  });

  it("reads what a person types: case, dashes, spaces, I, L and O", () => {
    const code = "0123456789ABCDEFGHJK";
    expect(cleanCode(formatCode(code).toLowerCase())).toBe(code);
    expect(cleanCode("o123 4567 89ab cdef ghjk")).toBe(code);
    expect(cleanCode("I123456789ABCDEFGHJK")).toBe("1123456789ABCDEFGHJK");
    expect(cleanCode("too short")).toBeNull();
    expect(cleanCode("0123456789ABCDEFGHJU")).toBeNull();
  });

  it("derives the same record id from the same code, and a different one from another code", async () => {
    const id = await recordId("0123456789ABCDEFGHJK");
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(await recordId("0123456789ABCDEFGHJK")).toBe(id);
    expect(await recordId("0123456789ABCDEFGHJM")).not.toBe(id);
  });

  it("opens what it sealed, and refuses the wrong code", async () => {
    const box = await encrypt("0123456789ABCDEFGHJK", ACCOUNT);
    expect(box.ct).not.toContain("sticker");
    expect(await decrypt("0123456789ABCDEFGHJK", box)).toBe(ACCOUNT);
    await expect(decrypt("0123456789ABCDEFGHJM", box)).rejects.toThrow();
  });
});

/** Shared with the Android build: an id and a ciphertext made here must open there. UPDATE_VECTORS=1 rewrites it. */
describe("shared handover vector", () => {
  it("opens with this implementation", async () => {
    const file = new URL("../../spec/vectors/handover.json", import.meta.url);
    const { readFileSync, writeFileSync, existsSync } = await import("node:fs");
    const code = "0123456789ABCDEFGHJK";
    if (process.env.UPDATE_VECTORS || !existsSync(file)) {
      const box = await encrypt(code, ACCOUNT);
      writeFileSync(file, JSON.stringify({ about: "A handover made by the web build. The Android build must derive the same id and open it.", code, recordId: await recordId(code), plain: ACCOUNT, ...box }, null, 2) + "\n");
    }
    const v = JSON.parse(readFileSync(file, "utf8")) as { code: string; recordId: string; plain: string; iv: string; ct: string };
    expect(await recordId(v.code)).toBe(v.recordId);
    expect(await decrypt(v.code, { iv: v.iv, ct: v.ct })).toBe(v.plain);
  });
});
