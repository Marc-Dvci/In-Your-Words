/**
 * Who writes the next follow-up question. Every path goes through Firebase AI Logic, except the fixed-question
 * path, which uses no model, and the replay path, which plays back answers recorded from real AI Logic runs.
 */

import { getGenerativeModel, InferenceMode, InferenceSource, Schema, type GenerativeModel, type LanguageModelExpected } from "firebase/ai";
import { followupPrompt, parseProposal, SYSTEM_PROMPT, type Proposal, type Session } from "@iyw/core";
import type { Services } from "./firebase";
import recorded from "../demo/recorded.json";

export interface Proposed {
  proposal: Proposal | null;
  source: "on_device" | "in_cloud";
  ms: number;
}

export interface Engine {
  kind: "on_device" | "cloud" | "templates" | "replay";
  propose(session: Session): Promise<Proposed | null>;
}

/** What Chrome reports for its built-in model. `unsupported` means the browser has no Prompt API at all. */
export type DeviceStatus = "available" | "downloadable" | "downloading" | "unavailable" | "unsupported";

const LANGS: { expectedInputs: LanguageModelExpected[]; expectedOutputs: LanguageModelExpected[] } = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

export async function deviceStatus(): Promise<DeviceStatus> {
  const lm = (globalThis as { LanguageModel?: { availability(o?: unknown): Promise<string> } }).LanguageModel;
  if (!lm) return "unsupported";
  try {
    return (await lm.availability(LANGS)) as DeviceStatus;
  } catch {
    return "unavailable";
  }
}

const proposalSchema = Schema.object({
  properties: {
    anchor: Schema.string({ description: "A phrase of 1 to 6 words copied exactly from the witness's words." }),
    question: Schema.string({ description: "One open question about the anchor, using only the witness's words." }),
  },
});

const jsonConstraint = {
  type: "object",
  properties: { anchor: { type: "string" }, question: { type: "string" } },
  required: ["anchor", "question"],
};

/**
 * The hybrid model. On a device with a model, `ONLY_ON_DEVICE`: the witness's words never leave, and a failure
 * never falls back to the cloud. Without one, `ONLY_IN_CLOUD`, and only after the witness agreed.
 */
export function hybridModel(s: Services, where: "on_device" | "cloud"): GenerativeModel {
  return getGenerativeModel(s.ai, {
    mode: where === "on_device" ? InferenceMode.ONLY_ON_DEVICE : InferenceMode.ONLY_IN_CLOUD,
    onDeviceParams: {
      createOptions: {
        ...LANGS,
        initialPrompts: [{ role: "system", content: [{ type: "text", value: SYSTEM_PROMPT }] }],
      },
      promptOptions: { responseConstraint: jsonConstraint },
    },
    inCloudParams: {
      model: s.config.cloudModel,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: { responseMimeType: "application/json", responseSchema: proposalSchema, temperature: 0.3 },
    },
  });
}

export class HybridEngine implements Engine {
  readonly kind: "on_device" | "cloud";
  private model: GenerativeModel;

  constructor(s: Services, where: "on_device" | "cloud") {
    this.kind = where;
    this.model = hybridModel(s, where);
  }

  /** Downloads Chrome's model if needed. Must run from a click or key press. */
  prepare(onProgress: (share: number) => void): Promise<void> {
    return this.model.initializeDeviceModel(onProgress);
  }

  async propose(session: Session): Promise<Proposed> {
    const prompt = followupPrompt(session);
    const t0 = performance.now();
    const r = await this.model.generateContent(prompt);
    const ms = Math.round(performance.now() - t0);
    const source = r.response.inferenceSource === InferenceSource.ON_DEVICE ? "on_device" : "in_cloud";
    const raw = r.response.text();
    // Development builds keep each real run, so the demo can replay exactly what the model wrote.
    if (import.meta.env.DEV) ((globalThis as { __iywRuns?: Recording[] }).__iywRuns ??= []).push({ prompt, raw, source, ms });
    return { proposal: parseProposal(raw), source, ms };
  }
}

export class TemplateEngine implements Engine {
  readonly kind = "templates" as const;
  async propose(): Promise<null> {
    return null;
  }
}

interface Recording {
  prompt: string;
  raw: string;
  source: "on_device" | "in_cloud";
  ms: number;
}

/** Plays back proposals recorded from real runs, keyed by the exact request text. */
export class ReplayEngine implements Engine {
  readonly kind = "replay" as const;
  private byPrompt = new Map<string, Recording>((recorded as { runs: Recording[] }).runs.map((r) => [r.prompt, r]));

  async propose(session: Session): Promise<Proposed | null> {
    const hit = this.byPrompt.get(followupPrompt(session));
    if (!hit) return null;
    await new Promise((r) => setTimeout(r, Math.min(hit.ms, 1600)));
    return { proposal: parseProposal(hit.raw), source: hit.source, ms: hit.ms };
  }
}
