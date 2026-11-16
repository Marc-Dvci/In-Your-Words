import { useEffect, useRef, useState } from "preact/hooks";
import { answer as withAnswer, ask, currentTurn, decide, nextPhase, PHASES, phaseIndex, wantsFollowup, type Session } from "@iyw/core";
import { Account, GuardNote, Links, Question, Thinking, Write, type Segment } from "../components/InterviewParts";
import type { Engine } from "../lib/engine";
import { transition } from "../lib/motion";
import { useRuntime } from "../lib/runtime";

interface Props {
  session: Session;
  engine: Engine;
  onChange: (s: Session) => void;
  onDone: (s: Session) => void;
  onHandover: () => void;
}

function segmentsOf(s: Session): Segment[] {
  return s.phases.flatMap((p) => p.turns.filter((t) => t.answer.trim()).map((t) => ({ phase: p.id, text: t.answer })));
}

function startedAt(s: Session): string {
  return new Date(s.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function Interview({ session, engine, onChange, onDone, onHandover }: Props) {
  const { config } = useRuntime();
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState<number | null>(null);
  const [arriving, setArriving] = useState<number | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const qref = useRef<HTMLDivElement>(null);
  const prompt = currentTurn(session).prompt;
  const segments = segmentsOf(session);
  const where = engine.kind === "templates" ? null : engine.kind === "cloud" ? "cloud" : engine.kind === "replay" ? "replay" : "on_device";

  // Centres the question, but keeps the witness's phrase it quotes below the top bar, and the answer field on screen.
  useEffect(() => {
    const q = qref.current?.getBoundingClientRect();
    if (!q) return;
    let top = scrollY + q.top + q.height / 2 - innerHeight / 2;
    const phrases = busy ? [] : [...(stage.current?.querySelectorAll<HTMLElement>(".src") ?? [])];
    const field = stage.current?.querySelector("textarea")?.getBoundingClientRect();
    if (phrases.length && field) {
      const bar = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
      const phrase = Math.min(...phrases.map((e) => e.getBoundingClientRect().top));
      top = Math.max(Math.min(top, scrollY + phrase - bar - 24), scrollY + field.bottom - innerHeight + 24);
    }
    scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [prompt.text, busy]);

  const advance = (s: Session) => {
    const next = nextPhase(s);
    if (!next) {
      onDone(s);
      return;
    }
    transition(() => {
      setMs(null);
      onChange(next);
    });
  };

  const send = async (text: string) => {
    const answered = withAnswer(session, text);
    setArriving(segmentsOf(answered).length - 1);
    onChange(answered);
    if (!wantsFollowup(answered, config.maxFollowups)) {
      advance(answered);
      return;
    }
    setBusy(true);
    const proposed = await engine.propose(answered).catch(() => null);
    const d = decide(answered, proposed?.proposal ?? null, proposed?.source ?? "on_device");
    setMs(d.prompt.source === "template" ? null : (proposed?.ms ?? null));
    setBusy(false);
    onChange(ask(answered, d.prompt));
  };

  const skip = () => advance(session);
  const phase = PHASES[phaseIndex(session)]!;

  return (
    <div class="stage" ref={stage}>
      {segments.length ? (
        <section class="account" aria-label="Your words">
          <span class="eyebrow">
            Your words<span class="sep">·</span>
            {startedAt(session)}
          </span>
          <Account segments={segments} links={prompt.links} arriving={arriving} />
        </section>
      ) : null}

      <div class={`qwrap${segments.length ? "" : " first"}`} ref={qref}>
        {busy && where ? <Thinking where={where} /> : <Question prompt={prompt} ms={ms} />}
      </div>

      <Write
        busy={busy}
        onSend={(t) => void send(t)}
        onSkip={skip}
        onHandover={onHandover}
        placeholder={prompt.kind === "opening" ? `Write about ${phase.title.toLowerCase()} here…` : "Write your answer here…"}
      />

      {!busy ? <GuardNote rejected={prompt.rejected} /> : null}
      {!busy ? <Links stage={stage} links={prompt.links} deps={[prompt.text, segments.length]} /> : null}
    </div>
  );
}
