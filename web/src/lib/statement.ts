/**
 * The formal statement, drafted in the cloud when the witness asks for it, and read back by Gemini text-to-speech.
 * Code keeps only sentences whose every word comes from a quote the witness actually wrote.
 */

import { getGenerativeModel, InferenceMode, ResponseModality, Schema } from "firebase/ai";
import { DRAFT_SYSTEM, trace, type DraftSentence, type SealedAccount, type TraceResult } from "@iyw/core";
import type { Services } from "./firebase";

/** The account as one text: every answer, in order, separated by a blank line. Quotes are searched in it. */
export function accountText(a: SealedAccount): string {
  return a.phases.flatMap((p) => p.turns.map((t) => t.answer)).join("\n\n");
}

const draftSchema = Schema.object({
  properties: {
    sentences: Schema.array({
      items: Schema.object({ properties: { text: Schema.string(), quotes: Schema.array({ items: Schema.string() }) } }),
    }),
  },
});

export async function draft(s: Services, a: SealedAccount): Promise<{ text: string; result: TraceResult; ms: number }> {
  const model = getGenerativeModel(s.ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: s.config.cloudModel,
      systemInstruction: DRAFT_SYSTEM,
      generationConfig: { responseMimeType: "application/json", responseSchema: draftSchema, temperature: 0.2 },
    },
  });
  const text = accountText(a);
  const t0 = performance.now();
  const r = await model.generateContent(`The witness's answers:\n"""\n${text}\n"""\n\nWrite the statement.`);
  const ms = Math.round(performance.now() - t0);
  const parsed = JSON.parse(r.response.text()) as { sentences?: DraftSentence[] };
  return { text, result: trace(text, parsed.sentences ?? []), ms };
}

/** Reads the kept sentences aloud and calls `onEnd` when the reading finishes. Returns a function that stops it. */
export async function speak(s: Services, text: string, onEnd: () => void): Promise<() => void> {
  const model = getGenerativeModel(s.ai, {
    model: s.config.ttsModel,
    generationConfig: {
      responseModalities: [ResponseModality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
    },
  });
  const r = await model.generateContent(`Read this witness statement slowly and clearly:\n\n${text}`);
  const part = r.response.inlineDataParts()?.[0]?.inlineData;
  if (!part) throw new Error("no audio returned");
  const rate = Number(/rate=(\d+)/.exec(part.mimeType)?.[1] ?? 24000);
  const bytes = Uint8Array.from(atob(part.data), (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const ctx = new AudioContext({ sampleRate: rate });
  const buf = ctx.createBuffer(1, bytes.length / 2, rate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = view.getInt16(i * 2, true) / 32768;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  const close = () => void ctx.close().catch(() => undefined);
  src.onended = () => {
    close();
    onEnd();
  };
  src.start();
  return () => {
    src.onended = null;
    src.stop();
    close();
  };
}
