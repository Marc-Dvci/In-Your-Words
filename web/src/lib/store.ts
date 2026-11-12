/**
 * Where seals and handovers are kept. With Firebase: Firestore, under rules that make a seal write-once and keep
 * the server's own timestamp. In replay mode: this browser's storage, and the screen says so.
 */

import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { decrypt, encrypt, recordId, type Sealed } from "@iyw/core";
import type { Services } from "./firebase";

export interface SealRecord {
  fingerprint: string;
  sealedAt: Date;
  /** True when this fingerprint had already been sealed earlier: the first time is kept. */
  existing: boolean;
}

export interface Store {
  where: "firestore" | "browser";
  seal(fingerprint: string, mode: string, client: string): Promise<SealRecord>;
  lookup(fingerprint: string): Promise<SealRecord | null>;
  putHandover(code: string, plain: string): Promise<void>;
  takeHandover(code: string): Promise<string | null>;
}

const HANDOVER_MINUTES = 30;

export class FirestoreStore implements Store {
  readonly where = "firestore" as const;
  constructor(private s: Services) {}

  async lookup(fingerprint: string): Promise<SealRecord | null> {
    const snap = await getDoc(doc(this.s.db, "seals", fingerprint));
    if (!snap.exists()) return null;
    return { fingerprint, sealedAt: (snap.get("createdAt") as Timestamp).toDate(), existing: true };
  }

  async seal(fingerprint: string, mode: string, client: string): Promise<SealRecord> {
    const ref = doc(this.s.db, "seals", fingerprint);
    try {
      await setDoc(ref, { v: 1, createdAt: serverTimestamp(), mode, client });
    } catch (e) {
      // The rules refuse to overwrite a seal: the first one stands.
      const before = await this.lookup(fingerprint);
      if (before) return before;
      throw e;
    }
    const after = await getDoc(ref);
    return { fingerprint, sealedAt: (after.get("createdAt") as Timestamp).toDate(), existing: false };
  }

  async putHandover(code: string, plain: string): Promise<void> {
    const box = await encrypt(code, plain);
    const now = Date.now();
    await setDoc(doc(this.s.db, "handovers", await recordId(code)), {
      ...box,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now + HANDOVER_MINUTES * 60_000),
    });
  }

  async takeHandover(code: string): Promise<string | null> {
    const ref = doc(this.s.db, "handovers", await recordId(code));
    // An unknown or expired code reads as "permission denied" under the rules: both mean nothing waits here.
    const snap = await getDoc(ref).catch(() => null);
    if (!snap?.exists()) return null;
    const plain = await decrypt(code, { iv: snap.get("iv") as string, ct: snap.get("ct") as string });
    await deleteDoc(ref).catch(() => undefined);
    return plain;
  }
}

export class BrowserStore implements Store {
  readonly where = "browser" as const;

  async lookup(fingerprint: string): Promise<SealRecord | null> {
    const at = localStorage.getItem(`iyw:seal:${fingerprint}`);
    return at ? { fingerprint, sealedAt: new Date(at), existing: true } : null;
  }

  async seal(fingerprint: string): Promise<SealRecord> {
    const before = await this.lookup(fingerprint);
    if (before) return before;
    const at = new Date();
    localStorage.setItem(`iyw:seal:${fingerprint}`, at.toISOString());
    return { fingerprint, sealedAt: at, existing: false };
  }

  async putHandover(code: string, plain: string): Promise<void> {
    const box: Sealed = await encrypt(code, plain);
    localStorage.setItem(`iyw:handover:${await recordId(code)}`, JSON.stringify(box));
  }

  async takeHandover(code: string): Promise<string | null> {
    const key = `iyw:handover:${await recordId(code)}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    localStorage.removeItem(key);
    return decrypt(code, JSON.parse(raw) as Sealed);
  }
}
