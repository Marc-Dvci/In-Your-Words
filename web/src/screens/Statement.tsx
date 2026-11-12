import { useRef, useState } from "preact/hooks";
import type { SealedAccount, TraceResult } from "@iyw/core";
import { draft, speak } from "../lib/statement";
import { useRuntime } from "../lib/runtime";

/**
 * A first-person statement drafted from the sealed account. Hover a sentence to see the words it came from.
 * Sentences the code could not trace to the witness's words are dropped, and counted on screen.
 */
export function Statement({ account, back }: { account: SealedAccount; back: () => void }) {
  const { live } = useRuntime();
  const [state, setState] = useState<"ask" | "busy" | "done" | "error">("ask");
  const [out, setOut] = useState<{ text: string; result: TraceResult; ms: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const stop = useRef<(() => void) | null>(null);

  const run = async () => {
    if (!live) return;
    setState("busy");
    try {
      setOut(await draft(live, account));
      setState("done");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  };

  const read = async () => {
    if (!live || !out) return;
    if (reading) {
      stop.current?.();
      setReading(false);
      return;
    }
    setReading(true);
    try {
      stop.current = await speak(live, out.result.kept.map((k) => k.text).join(" "));
    } catch (e) {
      setError((e as Error).message);
      setReading(false);
    }
  };

  if (state === "ask" || state === "busy" || state === "error")
    return (
      <div class="enter">
        <p class="eyebrow">Draft a statement</p>
        <h1 class="display" style={{ fontSize: "clamp(34px, 4.2vw, 52px)" }}>
          Turn your account into a statement.
        </h1>
        <p class="lede">
          Your answers are sent to Google's Gemini API through Firebase, which drafts a first-person statement. Every sentence must cite the words you wrote,
          and code removes any sentence that adds one.
        </p>
        <p class="body" style={{ marginTop: "14px" }}>
          This demo runs on Gemini's free tier: outside the EU, the UK and Switzerland, Google may use the text to improve its products. Use test details.
        </p>
        <div class="actions" style={{ marginTop: "32px" }}>
          <button class="btn green" type="button" disabled={state === "busy"} onClick={() => void run()}>
            {state === "busy" ? "Drafting in the cloud…" : "I agree, draft it"}
          </button>
          <button class="link" type="button" onClick={back}>
            Back
          </button>
        </div>
        {state === "error" ? (
          <p class="dot fixed" style={{ marginTop: "20px", color: "var(--red)" }}>
            {error}
          </p>
        ) : null}
      </div>
    );

  const { result, text, ms } = out!;
  const src = hover === null ? [] : result.kept[hover]!.sources;
  const marked: preact.ComponentChildren[] = [];
  let at = 0;
  for (const r of [...src].sort((a, b) => a.start - b.start)) {
    if (r.start < at) continue;
    marked.push(text.slice(at, r.start), <mark class="quote-hl" key={r.start}>{text.slice(r.start, r.end)}</mark>);
    at = r.end;
  }
  marked.push(text.slice(at));

  return (
    <div class="enter">
      <p class="eyebrow">
        Drafted in the cloud<span class="sep">·</span>
        {(ms / 1000).toFixed(1)} s<span class="sep">·</span>
        {result.kept.length} sentences kept{result.dropped.length ? `, ${result.dropped.length} dropped for adding words you did not write` : ""}
      </p>
      <div class="statement-grid">
        <div class="statement">
          {result.kept.map((k, i) => (
            <p key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} tabIndex={0}>
              {k.text}
            </p>
          ))}
        </div>
        <aside class="source-text" aria-label="Your words">
          {marked}
        </aside>
      </div>
      <div class="actions" style={{ marginTop: "36px" }}>
        <button class="btn green" type="button" onClick={() => void read()}>
          {reading ? "Stop reading" : "Read it to me"}
        </button>
        <button class="link" type="button" onClick={() => print()}>
          Print
        </button>
        <button class="link" type="button" onClick={back}>
          Back
        </button>
      </div>
      {error && state === "done" ? (
        <p class="dot fixed" style={{ marginTop: "16px", color: "var(--red)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
