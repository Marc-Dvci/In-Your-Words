import { useEffect, useState } from "preact/hooks";
import type { Mode } from "@iyw/core";
import { deviceStatus, HybridEngine, type DeviceStatus } from "../lib/engine";
import { useRuntime } from "../lib/runtime";

/**
 * Before the interview: say where the questions will be written, and let the witness choose when this device has
 * no model. Nothing is sent anywhere until the witness picks the cloud.
 */
export function Setup({ begin, back }: { begin: (mode: Mode, engine: HybridEngine | null) => void; back: () => void }) {
  const { live, replay } = useRuntime();
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void deviceStatus().then(setStatus);
  }, []);

  const onDevice = async () => {
    if (!live) return;
    setError(null);
    const engine = new HybridEngine(live, "on_device");
    try {
      if (status !== "available") {
        setProgress(0);
        await engine.prepare((p) => setProgress(p));
      }
      begin("on_device", engine);
    } catch (e) {
      setProgress(null);
      setError(`The on-device model could not start: ${(e as Error).message}`);
    }
  };

  if (replay) {
    return (
      <div class="enter">
        <p class="eyebrow">Before you start</p>
        <h1 class="display" style={{ fontSize: "clamp(36px, 4.6vw, 56px)" }}>
          This is the demo.
        </h1>
        <p class="lede">Questions are replayed from runs recorded on a real device, so you can see the whole interview here.</p>
        <div class="actions" style={{ marginTop: "36px" }}>
          <button class="btn green" type="button" onClick={() => begin("on_device", null)}>
            Begin the demo
          </button>
          <button class="link" type="button" onClick={back}>
            Back
          </button>
        </div>
      </div>
    );
  }

  const here = status === "available" || status === "downloadable" || status === "downloading";
  return (
    <div class="enter">
      <p class="eyebrow">Before you start</p>
      <h1 class="display" style={{ fontSize: "clamp(36px, 4.6vw, 56px)" }}>
        {status === null ? "Checking this device…" : here ? "This device can write the questions." : "This device has no on-device model."}
      </h1>
      <div class="choices">
        {here ? (
          <div class="choice">
            <Glyph kind="device" />
            <h3>Questions written on this device</h3>
            <p>
              Your words stay here. The follow-up questions are written by the model built into this browser, and a check refuses any question that uses a word
              you did not say.
              {status !== "available" ? " The model downloads once before the first question." : ""}
            </p>
            {progress !== null ? (
              <div class="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <span class="track">
                  <i style={{ transform: `scaleX(${progress})` }} />
                </span>
                {Math.round(progress * 100)} %
              </div>
            ) : (
              <div class="actions">
                <button class="btn green" type="button" onClick={onDevice}>
                  {status === "available" ? "Begin" : "Download and begin"}
                </button>
              </div>
            )}
          </div>
        ) : null}
        {status !== null ? (
          <div class="choice">
            <Glyph kind="cloud" />
            <h3>{here ? "Or: questions written in the cloud" : "Questions written in the cloud"}</h3>
            <p>
              Each answer is sent to Google's Gemini API through Firebase to write the next question, and the same check refuses any question that uses a word
              you did not say. This demo runs on Gemini's free tier: outside the EU, the UK and Switzerland, Google may use that text to improve its products.
              Use test details, not a real person's.
            </p>
            <div class="actions">
              <button class={here ? "link" : "btn"} type="button" onClick={() => live && begin("cloud", new HybridEngine(live, "cloud"))}>
                I agree, use the cloud
              </button>
            </div>
          </div>
        ) : null}
        {status !== null ? (
          <div class="choice">
            <Glyph kind="fixed" />
            <h3>Fixed questions only</h3>
            <p>No model at all, and nothing leaves this device. The interview asks the same questions to everyone.</p>
            <div class="actions">
              <button class="link" type="button" onClick={() => begin("templates", null)}>
                Use fixed questions
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {error ? (
        <p class="dot fixed" style={{ marginTop: "28px", color: "var(--red)" }}>
          {error}
        </p>
      ) : null}
      <div class="actions" style={{ marginTop: "40px" }}>
        <button class="link" type="button" onClick={back}>
          Back
        </button>
      </div>
    </div>
  );
}

function Glyph({ kind }: { kind: "device" | "cloud" | "fixed" }) {
  return (
    <svg class="glyph" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18.5" fill="none" stroke={kind === "device" ? "#1D6B5B" : "#12324B"} stroke-width="1" />
      {kind === "device" ? <rect x="12" y="13" width="16" height="12" rx="2" fill="none" stroke="#1D6B5B" stroke-width="1.3" /> : null}
      {kind === "device" ? <path d="M16 28h8" stroke="#1D6B5B" stroke-width="1.3" /> : null}
      {kind === "cloud" ? <path d="M14 25h12a4 4 0 0 0 .5-7.9A6 6 0 0 0 15 16.6 4.4 4.4 0 0 0 14 25z" fill="none" stroke="#12324B" stroke-width="1.3" /> : null}
      {kind === "fixed" ? <path d="M13 15h14M13 20h14M13 25h9" stroke="#12324B" stroke-width="1.3" /> : null}
    </svg>
  );
}
