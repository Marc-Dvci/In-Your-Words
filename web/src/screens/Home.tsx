import { Rosette } from "../components/Rosette";
import { useRuntime } from "../lib/runtime";

const WATERMARK = "4fa7c01e93d25b68e0a1f4c7b3926d58c1e07a4f2b9d36e81c5a0f7d4e2b9c63";

export function Home({ start, verify, receive, resume }: { start: () => void; verify: () => void; receive: () => void; resume: (() => void) | null }) {
  const { replay, store } = useRuntime();
  return (
    <div class="enter home">
      <p class="eyebrow">For someone who has just seen something happen</p>
      <h1 class="display">
        Write down what you saw,
        <br />
        before anything changes it.
      </h1>
      <p class="lede">
        A guided interview that can only ask about words you have already used. The questions are written on this device, and only a fingerprint of your account
        is sealed.
      </p>
      <div class="actions">
        {resume ? (
          <button class="btn green" type="button" onClick={resume}>
            Continue your account
          </button>
        ) : null}
        <button class={`btn${resume ? "" : " green"}`} type="button" onClick={start}>
          Start a new account
        </button>
        <button class="link" type="button" onClick={receive}>
          Continue from another device
        </button>
        <button class="link" type="button" onClick={verify}>
          Check a sealed account
        </button>
      </div>
      <p class="dot fixed home-note">
        {replay
          ? "Replaying an interview recorded on a real device."
          : store.where === "firestore"
            ? "Seals are kept by Firebase with the server's own time. Your words never are."
            : ""}
      </p>
      <ol class="steps">
        <li>
          <span class="n">01</span>
          <b>Your words stay here</b>
          <span>Follow-up questions are written by the model built into this browser. Your answers are not sent anywhere.</span>
        </li>
        <li>
          <span class="n">02</span>
          <b>No word of ours</b>
          <span>A check refuses any question that uses a word you never said, or that can be answered yes or no.</span>
        </li>
        <li>
          <span class="n">03</span>
          <b>A seal with a time</b>
          <span>A fingerprint of the whole interview is sealed with the server's clock, so anyone can later see it has not changed.</span>
        </li>
      </ol>
      <div class="watermark" aria-hidden="true">
        <Rosette hex={WATERMARK} animate={false} label="" />
      </div>
    </div>
  );
}
