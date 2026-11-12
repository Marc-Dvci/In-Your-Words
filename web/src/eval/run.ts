/**
 * Development-only evaluation harness. For each witness description it asks both paths of the same hybrid model,
 * on-device and in the cloud, for an unguarded follow-up proposal, and keeps the raw output and timing. Scoring is
 * done afterwards, offline and deterministically, from the saved file.
 */

import { answer, followupPrompt, newSession, nextPhase, PLAIN_SYSTEM_PROMPT } from "@iyw/core";
import { configured, services } from "../lib/firebase";
import { HybridEngine } from "../lib/engine";

interface Item {
  id: string;
  text: string;
}

type Path = "on_device" | "cloud" | "on_device_plain" | "cloud_plain";

interface Row {
  id: string;
  path: Path;
  prompt: string;
  raw: string | null;
  source: string | null;
  ms: number | null;
  error: string | null;
}

const log = document.getElementById("log")!;

async function run(items: Item[], paths: Path[]): Promise<Row[]> {
  if (!configured()) throw new Error("no Firebase project configured");
  const s = await services();
  const engines = Object.fromEntries(
    paths.map((p) => [p, new HybridEngine(s, p.startsWith("on_device") ? "on_device" : "cloud", p.endsWith("_plain") ? PLAIN_SYSTEM_PROMPT : undefined)]),
  ) as Record<string, HybridEngine>;
  const rows: Row[] = [];
  for (const [i, item] of items.entries()) {
    const session = answer(nextPhase(newSession("on_device", "2026-11-12T00:00:00.000Z"))!, item.text);
    for (const path of paths) {
      const prompt = followupPrompt(session);
      try {
        const g = await engines[path]!.generate(prompt);
        rows.push({ id: item.id, path, prompt, raw: g.raw, source: g.source, ms: g.ms, error: null });
      } catch (e) {
        rows.push({ id: item.id, path, prompt, raw: null, source: null, ms: null, error: (e as Error).message.slice(0, 300) });
      }
      log.textContent = `${i + 1}/${items.length} ${path}`;
    }
  }
  return rows;
}

(window as unknown as { __evalRun: typeof run }).__evalRun = run;
