import { useEffect, useState } from "preact/hooks";
import { newSession, phaseIndex, type Mode, type SealedAccount, type Session } from "@iyw/core";
import { Rail } from "./components/Rail";
import { Mark } from "./components/Rosette";
import { ReplayEngine, TemplateEngine, type Engine } from "./lib/engine";
import { transition } from "./lib/motion";
import { loadLocal, saveLocal, useRuntime } from "./lib/runtime";
import type { SealRecord } from "./lib/store";
import { Send, Receive } from "./screens/Handover";
import { Home } from "./screens/Home";
import { Interview } from "./screens/Interview";
import { Review, Sealed } from "./screens/Seal";
import { Setup } from "./screens/Setup";
import { Verify } from "./screens/Verify";
import { demoSession } from "./demo/scene";

type Screen =
  | { name: "home" }
  | { name: "setup" }
  | { name: "interview" }
  | { name: "review" }
  | { name: "sealed"; record: SealRecord; account: SealedAccount }
  | { name: "verify" }
  | { name: "send" }
  | { name: "receive" };

const hasAnswers = (s: Session) => s.phases.some((p) => p.turns.some((t) => t.answer.trim()));

export function App() {
  const { replay } = useRuntime();
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [session, setSession] = useState<Session | null>(() => loadLocal<Session>());
  const [engine, setEngine] = useState<Engine | null>(null);

  useEffect(() => saveLocal(session), [session]);

  useEffect(() => {
    if (location.hash === "#/demo") {
      setSession(demoSession());
      setEngine(new ReplayEngine());
      setScreen({ name: "interview" });
    }
  }, []);

  const go = (s: Screen) => transition(() => setScreen(s));

  const begin = (mode: Mode, live: Engine | null) => {
    const s = session && hasAnswers(session) ? session : newSession(mode, new Date().toISOString());
    setSession(s);
    setEngine(replay ? new ReplayEngine() : (live ?? new TemplateEngine()));
    go({ name: "interview" });
  };

  const at = session ? phaseIndex(session) : -1;
  const showRail = screen.name === "interview" || screen.name === "review" || screen.name === "sealed";

  return (
    <>
      <div class="ground" />
      <header class="topbar">
        <div class="top">
          <button class="mark" type="button" onClick={() => go({ name: "home" })} aria-label="In Your Words, home">
            <Mark />
            In Your Words
          </button>
          {showRail ? <Rail at={at} complete={screen.name !== "interview"} /> : null}
        </div>
      </header>
      <div class="shell">
        <main>
          {screen.name === "home" ? (
            <Home
              start={() => {
                setSession(null);
                go({ name: "setup" });
              }}
              resume={session && hasAnswers(session) ? () => go({ name: "setup" }) : null}
              verify={() => go({ name: "verify" })}
              receive={() => go({ name: "receive" })}
            />
          ) : null}
          {screen.name === "setup" ? <Setup begin={begin} back={() => go({ name: "home" })} /> : null}
          {screen.name === "interview" && session && engine ? (
            <Interview session={session} engine={engine} onChange={setSession} onDone={(s) => (setSession(s), go({ name: "review" }))} />
          ) : null}
          {screen.name === "review" && session ? (
            <Review session={session} back={() => go({ name: "interview" })} onSealed={(record, account) => go({ name: "sealed", record, account })} />
          ) : null}
          {screen.name === "sealed" ? (
            <Sealed
              record={screen.record}
              account={screen.account}
              onHandover={() => go({ name: "send" })}
              onStatement={null}
              onRestart={() => {
                setSession(null);
                go({ name: "home" });
              }}
            />
          ) : null}
          {screen.name === "verify" ? <Verify back={() => go({ name: "home" })} /> : null}
          {screen.name === "send" && session ? <Send session={session} back={() => go({ name: "home" })} /> : null}
          {screen.name === "receive" ? (
            <Receive
              back={() => go({ name: "home" })}
              onSession={(s) => {
                setSession(s);
                go({ name: "setup" });
              }}
            />
          ) : null}
        </main>
      </div>
    </>
  );
}
