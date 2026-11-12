/** The scene the demo deep link opens on: a witness's first answer, and the follow-up recorded for it. */

import { answer, ask, decide, followupPrompt, newSession, parseProposal, type Session } from "@iyw/core";
import recorded from "./recorded.json";

export const DEMO_ANSWER =
  "I was waiting at the crossing by the bakery when a dark estate car came round the corner too fast. It clipped the back wheel of a cyclist and he fell against the kerb. The car slowed for a second, then drove off towards the bridge. I think the driver wore a cap. There was a sticker on the rear window, white, maybe round.";

export function demoSession(): Session {
  const s = answer(newSession("on_device", "2026-11-12T17:52:00.000Z"), DEMO_ANSWER);
  const run = (recorded as { runs: { prompt: string; raw: string; source: "on_device" | "in_cloud" }[] }).runs.find((r) => r.prompt === followupPrompt(s));
  if (!run) return s;
  return ask(s, decide(s, parseProposal(run.raw), run.source).prompt);
}
