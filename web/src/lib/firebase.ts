/**
 * Firebase wiring: App Check, Firestore, Remote Config and AI Logic. There is no sign-in: the witness has no account. When no project is configured
 * (a fresh clone, CI, or `?demo`), the app runs in replay mode and none of this is loaded.
 */

import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getFirestore, type Firestore } from "firebase/firestore";
import { fetchAndActivate, getRemoteConfig, getValue } from "firebase/remote-config";
import { getAI, GoogleAIBackend, type AI } from "firebase/ai";

export interface Services {
  app: FirebaseApp;
  ai: AI;
  db: Firestore;
  config: RuntimeConfig;
}

/** Values the team can change without a release, read from Remote Config. */
export interface RuntimeConfig {
  cloudModel: string;
  ttsModel: string;
  maxFollowups: number;
}

export const DEFAULTS: RuntimeConfig = {
  cloudModel: "gemini-3.5-flash-lite",
  ttsModel: "gemini-3.1-flash-tts-preview",
  maxFollowups: 2,
};

const env = import.meta.env;

export function configured(): boolean {
  return Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);
}

export function demoRequested(): boolean {
  return new URLSearchParams(location.search).has("demo") || location.hash.startsWith("#/demo");
}

let ready: Promise<Services> | null = null;

export function services(): Promise<Services> {
  ready ??= start();
  return ready;
}

async function start(): Promise<Services> {
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  if (env.VITE_APPCHECK_DEBUG) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG === "true" ? true : env.VITE_APPCHECK_DEBUG;
  if (env.VITE_RECAPTCHA_SITE_KEY || env.VITE_APPCHECK_DEBUG) {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_SITE_KEY ?? "debug"), isTokenAutoRefreshEnabled: true });
  }
  const rc = getRemoteConfig(app);
  rc.settings.minimumFetchIntervalMillis = 10 * 60 * 1000;
  rc.defaultConfig = { cloud_model: DEFAULTS.cloudModel, tts_model: DEFAULTS.ttsModel, max_followups: DEFAULTS.maxFollowups };
  try {
    await fetchAndActivate(rc);
  } catch {
    // Offline or blocked: the defaults above apply.
  }
  const config: RuntimeConfig = {
    cloudModel: getValue(rc, "cloud_model").asString() || DEFAULTS.cloudModel,
    ttsModel: getValue(rc, "tts_model").asString() || DEFAULTS.ttsModel,
    maxFollowups: getValue(rc, "max_followups").asNumber() || DEFAULTS.maxFollowups,
  };
  return { app, ai: getAI(app, { backend: new GoogleAIBackend() }), db: getFirestore(app), config };
}
