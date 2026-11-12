/** The running app's services, chosen once at start: live Firebase, or replay mode in this browser only. */

import { createContext } from "preact";
import { useContext } from "preact/hooks";
import { DEFAULTS, type RuntimeConfig, type Services } from "./firebase";
import type { Store } from "./store";

export interface Runtime {
  live: Services | null;
  store: Store;
  config: RuntimeConfig;
  /** True when the app replays recorded questions instead of calling a model. */
  replay: boolean;
}

export const RuntimeContext = createContext<Runtime>({ live: null, store: null as unknown as Store, config: DEFAULTS, replay: true });

export function useRuntime(): Runtime {
  return useContext(RuntimeContext);
}

const KEY = "iyw:session";

/** The interview in progress is kept on this device only, so a reload does not lose it. */
export function saveLocal<T>(value: T | null): void {
  try {
    if (value === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Storage can be full or blocked; the interview still works in memory.
  }
}

export function loadLocal<T>(): T | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
