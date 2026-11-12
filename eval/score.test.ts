import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { score, table, type Item, type Path, type Row } from "./score.js";

const here = (p: string) => new URL(p, import.meta.url);
const load = (split: string) => {
  const items = readFileSync(here(`./data/descriptions-${split}.jsonl`), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Item);
  const run = JSON.parse(readFileSync(here(`./runs/${split}.json`), "utf8")) as { meta: Record<string, unknown>; rows: Row[] };
  return { items, run };
};

for (const split of ["dev", "heldout"].filter((s) => existsSync(here(`./runs/${s}.json`)))) {
  describe(`the ${split} run`, () => {
    const { items, run } = load(split);
    const scores = Object.fromEntries((run.meta.paths as Path[]).map((p) => [p, score(items, run.rows, p)]));

    it("never shows the witness a question the guard refuses", () => {
      for (const s of Object.values(scores)) expect(s.shownRefused).toBe(0);
    });

    it("labels every answer with the path that actually served it", () => {
      for (const s of Object.values(scores)) expect(s.wrongSource).toBe(0);
    });

    it("matches the published results table", () => {
      const md = table(split, scores);
      const file = here(`./results-${split}.md`);
      if (process.env.UPDATE_EVAL) writeFileSync(file, md + "\n");
      expect(readFileSync(file, "utf8").trim()).toBe(md.trim());
    });
  });
}
