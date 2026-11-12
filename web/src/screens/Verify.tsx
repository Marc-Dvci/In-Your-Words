import { useState } from "preact/hooks";
import { fingerprint, HEX64, type SealedAccount } from "@iyw/core";
import { Rosette } from "../components/Rosette";
import { useRuntime } from "../lib/runtime";

type Result =
  | { kind: "match"; hex: string; at: Date }
  | { kind: "changed"; claimed: string; actual: string; at: Date }
  | { kind: "unknown"; actual: string }
  | { kind: "unreadable" };

/** Anyone holding an account file can check it against its seal, without the seal record holding any words. */
export function Verify({ back }: { back: () => void }) {
  const { store } = useRuntime();
  const [over, setOver] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const check = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as { fingerprint?: string; account?: SealedAccount };
      if (!data.account) throw new Error("no account");
      const actual = await fingerprint(data.account);
      const hit = await store.lookup(actual);
      if (hit) return setResult({ kind: "match", hex: actual, at: hit.sealedAt });
      const claimed = data.fingerprint && HEX64.test(data.fingerprint) ? data.fingerprint : null;
      const before = claimed ? await store.lookup(claimed) : null;
      if (claimed && before) return setResult({ kind: "changed", claimed, actual, at: before.sealedAt });
      setResult({ kind: "unknown", actual });
    } catch {
      setResult({ kind: "unreadable" });
    }
  };

  const pick = () => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept: "application/json,.json" });
    input.onchange = () => input.files?.[0] && void check(input.files[0]);
    input.click();
  };

  return (
    <div class="enter">
      <p class="eyebrow">Check a sealed account</p>
      <h1 class="display" style={{ fontSize: "clamp(34px, 4.2vw, 52px)", marginBottom: "36px" }}>
        Has it changed since it was sealed?
      </h1>
      {!result ? (
        <div
          class={`drop${over ? " over" : ""}`}
          role="button"
          tabIndex={0}
          onClick={pick}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && pick()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer?.files[0];
            if (f) void check(f);
          }}
        >
          <div>
            <p class="lede" style={{ margin: "0 auto" }}>
              Drop the account file here
            </p>
            <p class="body" style={{ margin: "8px auto 0" }}>
              or click to choose it. The file is read in this browser and never uploaded.
            </p>
          </div>
        </div>
      ) : (
        <Outcome r={result} />
      )}
      <div class="actions" style={{ marginTop: "36px" }}>
        {result ? (
          <button class="link" type="button" onClick={() => setResult(null)}>
            Check another file
          </button>
        ) : null}
        <button class="link" type="button" onClick={back}>
          Back
        </button>
      </div>
    </div>
  );
}

function Outcome({ r }: { r: Result }) {
  const when = (d: Date) => d.toLocaleString([], { dateStyle: "long", timeStyle: "medium" });
  if (r.kind === "unreadable") return <p class="verdict bad">This file is not an account from In Your Words.</p>;
  if (r.kind === "unknown")
    return (
      <div class="sealed">
        <Rosette hex={r.actual} />
        <div>
          <p class="verdict bad">No seal matches this account.</p>
          <p class="body" style={{ marginTop: "12px" }}>
            Either it was never sealed, or it was sealed somewhere else.
          </p>
        </div>
      </div>
    );
  if (r.kind === "match")
    return (
      <div class="sealed">
        <Rosette hex={r.hex} again={r.hex} />
        <div>
          <p class="verdict good">Unchanged since it was sealed.</p>
          <p class="body" style={{ marginTop: "12px" }}>
            Sealed {when(r.at)}. The rosette drawn from this file lands exactly on the sealed one.
          </p>
        </div>
      </div>
    );
  return (
    <div class="sealed">
      <Rosette hex={r.claimed} again={r.actual} />
      <div>
        <p class="verdict bad">Changed after it was sealed.</p>
        <p class="body" style={{ marginTop: "12px" }}>
          The account was sealed {when(r.at)}, and its words have changed since. In red, the rosette drawn from the words in this file.
        </p>
      </div>
    </div>
  );
}
