import { useEffect, useState } from "preact/hooks";
import { fingerprint, groupHex, mrzLine, PHASES, sealable, type SealedAccount, type Session } from "@iyw/core";
import { Rosette } from "../components/Rosette";
import { reducedMotion } from "../lib/motion";
import { useRuntime } from "../lib/runtime";
import type { SealRecord } from "../lib/store";

const TAG: Record<string, string> = { script: "script", on_device: "on this device", in_cloud: "in the cloud", template: "fixed" };

export function Review({ session, onSealed, back }: { session: Session; onSealed: (r: SealRecord, a: SealedAccount) => void; back: () => void }) {
  const { store, live } = useRuntime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const account = sealable(session);

  const seal = async () => {
    setBusy(true);
    setError(null);
    try {
      const hex = await fingerprint(account);
      const record = await store.seal(hex, session.mode, "web");
      onSealed(record, account);
    } catch (e) {
      setError(live ? `The seal could not be saved: ${(e as Error).message}` : String(e));
      setBusy(false);
    }
  };

  return (
    <div class="enter">
      <p class="eyebrow">Read it through</p>
      <h1 class="display" style={{ fontSize: "clamp(34px, 4.2vw, 52px)", marginBottom: "40px" }}>
        Your account, exactly as written.
      </h1>
      <div class="review">
        {account.phases
          .filter((p) => p.turns.length)
          .map((p) => (
            <section key={p.id}>
              <h3>{PHASES.find((x) => x.id === p.id)!.title}</h3>
              {p.turns.map((t, i) => (
                <div key={i}>
                  <p class="q">
                    <span>{t.question}</span>
                    <span class={`tag ${t.source}`}>{TAG[t.source]}</span>
                  </p>
                  <p class="a">{t.answer}</p>
                </div>
              ))}
            </section>
          ))}
      </div>
      <p class="body" style={{ marginTop: "48px" }}>
        Sealing computes a fingerprint of every question and every answer above. Only that fingerprint leaves this device, with the time it arrived.
      </p>
      <div class="actions" style={{ marginTop: "24px" }}>
        <button class="btn green" type="button" disabled={busy} onClick={() => void seal()}>
          {busy ? "Sealing…" : "Seal my account"}
        </button>
        <button class="link" type="button" disabled={busy} onClick={back}>
          Keep writing
        </button>
      </div>
      {error ? (
        <p class="dot fixed" style={{ marginTop: "20px", color: "var(--red)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The fingerprint's characters cycle, then settle one by one, left to right. */
function Scramble({ text }: { text: string }) {
  const [shown, setShown] = useState(reducedMotion() ? text.length : 0);
  useEffect(() => {
    if (reducedMotion()) return;
    let n = 0;
    const id = setInterval(() => {
      n += 2;
      setShown(n);
      if (n >= text.length) clearInterval(id);
    }, 22);
    return () => clearInterval(id);
  }, [text]);
  const pool = "0123456789abcdef";
  return (
    <>
      {[...text].map((ch, i) =>
        ch === " " ? (
          " "
        ) : (
          <span key={i} class={`ch${i < shown ? " settled" : ""}`}>
            {i < shown ? ch : pool[(i * 7 + shown) % 16]}
          </span>
        ),
      )}
    </>
  );
}

export function Sealed({
  record,
  account,
  onHandover,
  onStatement,
  onRestart,
}: {
  record: SealRecord;
  account: SealedAccount;
  onHandover: () => void;
  onStatement: (() => void) | null;
  onRestart: () => void;
}) {
  const { store } = useRuntime();
  const hex = record.fingerprint;
  const time = record.sealedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = record.sealedAt.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });

  const download = () => {
    const file = { app: "In Your Words", v: 1, fingerprint: hex, sealedAt: record.sealedAt.toISOString(), account };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `in-your-words-${hex.slice(0, 8)}.json` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div class="sealed enter">
      <Rosette hex={hex} />
      <div>
        <p class="eyebrow">{record.existing ? "Already sealed" : "Your account is sealed"}</p>
        <p class="stime" style={{ marginTop: "16px" }}>
          {time}
        </p>
        <p class="sdate">{date}</p>
        <div class="hex" aria-label={`Fingerprint ${hex}`}>
          {groupHex(hex).map((line, i) => (
            <div key={i}>
              <Scramble text={line} />
            </div>
          ))}
        </div>
        <p class="mrz" aria-hidden="true">
          <span>{mrzLine(hex, record.sealedAt)}</span>
        </p>
        <p class="only">
          {store.where === "firestore"
            ? "Only this fingerprint left your device. Firebase recorded the time it arrived, and nobody can change that record."
            : "Demo mode: the fingerprint is kept in this browser."}{" "}
          Change one character of the account and the fingerprint, and its rosette, change completely.
        </p>
        <div class="actions" style={{ marginTop: "30px" }}>
          <button class="btn green" type="button" onClick={download}>
            Keep a copy
          </button>
          <button class="link" type="button" onClick={onHandover}>
            Continue on another device
          </button>
          {onStatement ? (
            <button class="link" type="button" onClick={onStatement}>
              Draft a statement
            </button>
          ) : null}
          <button class="link" type="button" onClick={onRestart}>
            Start again
          </button>
        </div>
      </div>
    </div>
  );
}
