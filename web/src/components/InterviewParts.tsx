import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { RefObject } from "preact";
import { REASON_TEXT, type Link, type Prompt, type PromptSource, type Rejected } from "@iyw/core";
import { drawPath, reducedMotion } from "../lib/motion";

export interface Segment {
  phase: string;
  text: string;
}

/** The witness's words, with the runs the current question reuses marked in security green. */
export function Account({ segments, links, arriving }: { segments: Segment[]; links: Link[]; arriving: number | null }) {
  return (
    <div>
      {segments.map((s, i) => {
        const ranges = links
          .filter((l) => l.segment === i)
          .map((l) => [l.start, l.end] as [number, number])
          .sort((a, b) => a[0] - b[0])
          .reduce<[number, number][]>((acc, r) => {
            const last = acc[acc.length - 1];
            if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
            else acc.push([...r]);
            return acc;
          }, []);
        const parts: preact.ComponentChildren[] = [];
        let at = 0;
        for (const [a, b] of ranges) {
          parts.push(s.text.slice(at, a));
          parts.push(
            <span class="src" data-seg={i} data-s={a} data-e={b} key={`${i}:${a}`}>
              {s.text.slice(a, b)}
            </span>,
          );
          at = b;
        }
        parts.push(s.text.slice(at));
        const past = i < segments.length - 1 && !ranges.length;
        return (
          <p key={i} class={`answer-text${past ? " past" : ""}${arriving === i ? " arrive" : ""}`}>
            {parts}
          </p>
        );
      })}
    </div>
  );
}

const SOURCE_LABEL: Record<PromptSource, string> = {
  script: "From the interview script",
  on_device: "Asked on this device",
  in_cloud: "Written in the cloud",
  template: "A fixed question",
};

/** The question, revealed word by word. The witness's own words arrive in green, each run tied to its source. */
export function Question({ prompt, ms }: { prompt: Prompt; ms: number | null }) {
  const chunks: { lead: string; core: string; trail: string; start: number }[] = [];
  for (const m of prompt.text.matchAll(/(\S+)(\s*)/g)) {
    const [, word = "", space = ""] = m;
    const lead = word.match(/^[“"'(]*/)![0];
    const trail = word.slice(lead.length).match(/[.,!?;:”"')]*$/)![0];
    chunks.push({ lead, core: word.slice(lead.length, word.length - trail.length), trail: trail + space, start: m.index + lead.length });
  }
  const linkOf = (pos: number) => prompt.links.findIndex((l) => pos >= l.question.start && pos < l.question.end);
  return (
    <div class="qwrap-inner">
      <h2 class={`question${prompt.kind === "opening" ? " opening" : ""}`} aria-live="polite">
        {chunks.map((c, i) => {
          const li = linkOf(c.start);
          return (
            <span key={`${prompt.text}:${i}`} class="wd" style={{ animationDelay: `${reducedMotion() ? 0 : i * 38}ms` }}>
              {c.lead}
              {li >= 0 ? (
                <b class="g" data-link={li}>
                  {c.core}
                </b>
              ) : (
                c.core
              )}
              {c.trail}
            </span>
          );
        })}
      </h2>
      <div class="qmeta">
        <span class={`dot ${prompt.source === "in_cloud" ? "cloud" : prompt.source === "on_device" ? "live" : "fixed"}`}>
          {SOURCE_LABEL[prompt.source]}
          {ms !== null && (prompt.source === "on_device" || prompt.source === "in_cloud") ? ` · ${(ms / 1000).toFixed(1)} s` : ""}
        </span>
      </div>
    </div>
  );
}

/**
 * Lines from each run of the witness's words to its place in the question. They are drawn in the open space between
 * the account and the question, never across the text, and engrave themselves after the question arrives.
 */
export function Links({ stage, links, deps }: { stage: RefObject<HTMLDivElement | null>; links: Link[]; deps: unknown[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState(0);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize((n) => n + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [stage]);

  useLayoutEffect(() => {
    const host = stage.current;
    const s = svg.current;
    if (!host || !s) return;
    s.replaceChildren();
    const box = host.getBoundingClientRect();
    const account = host.querySelector<HTMLElement>(".account");
    if (!account) return;
    const floor = account.getBoundingClientRect().bottom - box.top + 14;
    const NS = "http://www.w3.org/2000/svg";
    links.forEach((l, i) => {
      const src = [...host.querySelectorAll<HTMLElement>(".src")].find(
        (e) => Number(e.dataset.seg) === l.segment && Number(e.dataset.s) <= l.start && Number(e.dataset.e) >= l.end,
      );
      const words = [...host.querySelectorAll<HTMLElement>(`.question .g[data-link="${i}"]`)];
      if (!src || !words.length) return;
      const a = src.getClientRects()[0]!;
      const firstTop = words[0]!.getBoundingClientRect().top;
      const line = words.map((w) => w.getBoundingClientRect()).filter((r) => Math.abs(r.top - firstTop) < 4);
      const x1 = a.left + a.width / 2 - box.left;
      const x2 = (Math.min(...line.map((r) => r.left)) + Math.max(...line.map((r) => r.right))) / 2 - box.left;
      const y2 = firstTop - box.top - 4;
      const dy = (y2 - floor) * 0.55;
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", `M${x1},${floor} C${x1},${floor + dy} ${x2},${y2 - dy} ${x2},${y2}`);
      s.appendChild(path);
      for (const [x, y, d] of [
        [x1, floor, 0],
        [x2, y2, 1],
      ] as const) {
        const c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", String(x));
        c.setAttribute("cy", String(y));
        c.setAttribute("r", "2.6");
        s.appendChild(c);
        if (!reducedMotion())
          c.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], {
            duration: 420,
            delay: 700 + i * 160 + d * 760,
            easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
            fill: "both",
          });
      }
      drawPath(path, 900, 760 + i * 160);
      src.classList.add("drawn");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, links, ...deps]);

  return <svg ref={svg} class="links" aria-hidden="true" />;
}

export function Thinking({ where }: { where: "on_device" | "cloud" | "replay" }) {
  const label = { on_device: "Writing the next question on this device", cloud: "Writing the next question in the cloud", replay: "Replaying a recorded question" }[where];
  return (
    <div class="thinking" role="status">
      <svg viewBox="0 0 180 28" aria-hidden="true">
        <path d="M0 14 C 22 2, 38 26, 60 14 S 98 2, 120 14 S 158 26, 180 14" />
        <path d="M0 14 C 22 26, 38 2, 60 14 S 98 26, 120 14 S 158 2, 180 14" />
      </svg>
      {label}
    </div>
  );
}

/** What the guard refused before the witness saw anything. */
export function GuardNote({ rejected }: { rejected: Rejected[] }) {
  if (!rejected.length) return null;
  return (
    <div class="guard" aria-label="Questions refused before you saw them">
      {rejected.map((r, i) => (
        <div class="row" key={i}>
          <span>Checked before you saw it:</span>
          <span class="cand">
            “{highlight(r.question, r.foreign)}”
          </span>
          <span class="why">{r.reasons.map((x) => REASON_TEXT[x]).join(", ")}</span>
        </div>
      ))}
    </div>
  );
}

function highlight(text: string, foreign: string[]): preact.ComponentChildren[] {
  if (!foreign.length) return [text];
  const re = new RegExp(`\\b(${foreign.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "g");
  const out: preact.ComponentChildren[] = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    out.push(text.slice(at, m.index));
    out.push(
      <span class="foreign" key={m.index}>
        {m[0]}
      </span>,
    );
    at = m.index + m[0].length;
  }
  out.push(text.slice(at));
  return out;
}

/** The answer: a writing line that grows with the text. Ctrl+Enter sends. */
export function Write({ onSend, onSkip, busy, placeholder }: { onSend: (t: string) => void; onSkip: () => void; busy: boolean; placeholder: string }) {
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(56, el.scrollHeight)}px`;
  }, [text]);

  useEffect(() => {
    if (!busy) ta.current?.focus({ preventScroll: true });
  }, [busy]);

  const send = () => {
    if (busy || !text.trim()) return;
    onSend(text);
    setText("");
  };

  return (
    <div class={`write${focus ? " focus" : ""}`}>
      <textarea
        ref={ta}
        value={text}
        disabled={busy}
        rows={1}
        placeholder={placeholder}
        aria-label="Your answer"
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div class="line" />
      <div class="actions">
        <button class="btn" type="button" disabled={busy || !text.trim()} onClick={send}>
          Next <kbd>Ctrl ↵</kbd>
        </button>
        <button class="link" type="button" disabled={busy} onClick={onSkip}>
          Nothing more to add
        </button>
      </div>
    </div>
  );
}
