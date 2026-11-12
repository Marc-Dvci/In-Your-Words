import { readFileSync, writeFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { answer, newSession, nextPhase } from "../src/interview.js";
import { curvePath, curvePoints, hexBytes, rosette } from "../src/rosette.js";
import { canonicalJson, fingerprint, groupHex, HEX64, mrzLine, sealable, sha256Hex } from "../src/seal.js";

const ACCOUNT = "There was a sticker on the rear window, white, maybe round.";

function session() {
  return nextPhase(answer(newSession("on_device", "2026-11-12T18:52:00.000Z"), ACCOUNT))!;
}

describe("canonical JSON", () => {
  it("sorts keys at every level and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[2,{"y":2,"z":1}]},"b":1}');
  });

  it("gives the same text whatever the key order", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string({ maxLength: 6 }), fc.oneof(fc.integer(), fc.string({ maxLength: 8 }), fc.boolean())), (o) => {
        const reversed = Object.fromEntries(Object.entries(o).reverse());
        expect(canonicalJson(reversed)).toBe(canonicalJson(o));
      }),
    );
  });
});

describe("the fingerprint", () => {
  it("matches the published SHA-256 test vector", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("covers every question asked and every answer given, and leaves out unanswered prompts", () => {
    const a = sealable(session());
    expect(a.phases).toHaveLength(2);
    expect(a.phases[0]!.turns[0]).toMatchObject({ answer: ACCOUNT, source: "script" });
    expect(a.phases[1]!.turns).toEqual([]);
  });

  it("is the same for the same interview, and changes when one character changes", async () => {
    const one = await fingerprint(sealable(session()));
    expect(one).toMatch(HEX64);
    expect(await fingerprint(sealable(session()))).toBe(one);
    const edited = nextPhase(answer(newSession("on_device", "2026-11-12T18:52:00.000Z"), ACCOUNT.replace("white", "whitе")))!; // Cyrillic е
    expect(await fingerprint(sealable(edited))).not.toBe(one);
  });

  it("prints in four lines of four groups", () => {
    const lines = groupHex("0123456789abcdef".repeat(4));
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("0123 4567 89ab cdef");
  });

  it("writes a 64-character machine-readable line", () => {
    const line = mrzLine("77d773b85deb".padEnd(64, "0"), new Date("2026-11-12T18:58:07.412Z"));
    expect(line).toHaveLength(64);
    expect(line.startsWith("IYW<<SEALED<<20261112T185807Z<<77D773B85DEB")).toBe(true);
  });
});

describe("the rosette", () => {
  const hex = "77d773b85debb99a138ad4a762bb99f34824e067d7099d940e121b936b4fe54f";

  it("draws four closed curves from the fingerprint", () => {
    const curves = rosette(hex);
    expect(curves).toHaveLength(4);
    for (const c of curves) {
      const pts = curvePoints(c, 0, 0, 100, 4000);
      const [x0, y0] = pts[0]!;
      const [x1, y1] = pts[pts.length - 1]!;
      expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThan(1e-6);
      expect(Math.max(...pts.map(([x, y]) => Math.hypot(x, y)))).toBeLessThanOrEqual(100 * c.extent + 1e-6);
    }
  });

  it("changes when the fingerprint changes", () => {
    expect(rosette(hex.replace(/^7/, "8"))).not.toEqual(rosette(hex));
  });

  it("refuses anything but a 64-digit lower-case fingerprint", () => {
    expect(() => hexBytes("ABC")).toThrow();
    expect(() => hexBytes(hex.toUpperCase())).toThrow();
  });

  it("writes an SVG path", () => {
    expect(curvePath(rosette(hex)[0]!, 116, 116, 100, 10)).toMatch(/^M\d/);
  });
});

/** The shared vectors the Android build checks itself against. Run with UPDATE_VECTORS=1 to rewrite them. */
describe("shared seal and rosette vectors", () => {
  const file = new URL("../../spec/vectors/seal.json", import.meta.url);

  it("match this implementation", async () => {
    const s = session();
    const account = sealable(s);
    const canonical = canonicalJson(account);
    const hex = await fingerprint(account);
    const vectors = { about: "Canonical account, its SHA-256 and the rosette it draws. Both platforms must agree.", account, canonical, sha256: hex, rosette: rosette(hex) };
    if (process.env.UPDATE_VECTORS) writeFileSync(file, JSON.stringify(vectors, null, 2) + "\n");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(vectors);
  });
});
