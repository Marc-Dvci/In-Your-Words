import { render } from "preact";
import "./styles/app.css";
import "./styles/interview.css";
import "./styles/seal.css";
import { App } from "./App";
import { configured, DEFAULTS, demoRequested, services } from "./lib/firebase";
import { RuntimeContext, type Runtime } from "./lib/runtime";
import { BrowserStore, FirestoreStore } from "./lib/store";

async function runtime(): Promise<Runtime> {
  if (!configured() || demoRequested()) return { live: null, store: new BrowserStore(), config: DEFAULTS, replay: true };
  const live = await services();
  return { live, store: new FirestoreStore(live), config: live.config, replay: false };
}

const root = document.getElementById("app")!;
runtime()
  .then((rt) =>
    render(
      <RuntimeContext.Provider value={rt}>
        <App />
      </RuntimeContext.Provider>,
      root,
    ),
  )
  .catch((e: Error) => {
    root.textContent = `In Your Words could not start: ${e.message}`;
  });
