import { useEffect, useState } from "preact/hooks";
import { cleanCode, formatCode, newCode, type Session } from "@iyw/core";
import { useRuntime } from "../lib/runtime";

/** Sends the account, encrypted, for another device to pick up with a 20-character code. */
export function Send({ session, back }: { session: Session; back: () => void }) {
  const { store } = useRuntime();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = newCode();
    store
      .putHandover(c, JSON.stringify(session))
      .then(() => setCode(c))
      .catch((e: Error) => setError(e.message));
  }, [session, store]);

  return (
    <div class="enter">
      <p class="eyebrow">Continue on another device</p>
      <h1 class="display" style={{ fontSize: "clamp(34px, 4.2vw, 52px)" }}>
        Type this code on your other device.
      </h1>
      {code ? (
        <p class="code">{formatCode(code)}</p>
      ) : (
        <p class="code" style={{ opacity: 0.3 }}>
          ····-····-····-····-····
        </p>
      )}
      <p class="body">
        Your account travels encrypted with a key made from this code. The code never leaves this screen, so the server stores only ciphertext it cannot read.
        It works once, for 30 minutes.
      </p>
      {error ? (
        <p class="dot fixed" style={{ marginTop: "16px", color: "var(--red)" }}>
          {error}
        </p>
      ) : null}
      <div class="actions" style={{ marginTop: "32px" }}>
        <button class="link" type="button" onClick={back}>
          Done
        </button>
      </div>
    </div>
  );
}

export function Receive({ onSession, back }: { onSession: (s: Session) => void; back: () => void }) {
  const { store } = useRuntime();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const code = cleanCode(typed);

  const open = async () => {
    if (!code) return;
    setError(null);
    try {
      const plain = await store.takeHandover(code);
      if (!plain) return setError("No account waits under this code. It may have expired, or been opened already.");
      onSession(JSON.parse(plain) as Session);
    } catch {
      setError("This code does not open the account. Check each character.");
    }
  };

  return (
    <div class="enter">
      <p class="eyebrow">Continue from another device</p>
      <h1 class="display" style={{ fontSize: "clamp(34px, 4.2vw, 52px)", marginBottom: "28px" }}>
        Type the code from your other device.
      </h1>
      <input
        class="code-input"
        value={typed}
        maxLength={24}
        placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
        aria-label="Code from your other device"
        onInput={(e) => setTyped((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => e.key === "Enter" && void open()}
      />
      {error ? (
        <p class="dot fixed" style={{ marginTop: "16px", color: "var(--red)" }}>
          {error}
        </p>
      ) : null}
      <div class="actions" style={{ marginTop: "32px" }}>
        <button class="btn green" type="button" disabled={!code} onClick={() => void open()}>
          Open my account
        </button>
        <button class="link" type="button" onClick={back}>
          Back
        </button>
      </div>
    </div>
  );
}
