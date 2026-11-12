# In Your Words: system card

## Who it is for, and what it is for

In Your Words is for a person who has just witnessed an incident: a collision, a theft, a fall in the street. It
guides them through a self-administered interview in the order of the Self-Administered Interview (Gabbert, Hope and
Fisher, 2009): what happened, the people, the vehicles, the events in reverse order, and the surroundings. Follow-up
questions are written from the witness's own words, so the account they keep is theirs.

The account is the witness's. It stays on their device, they read it through before sealing, and they decide whether
to keep a copy, continue on another device, or draft a statement from it.

## What stays with people

The app records what the witness says and proves when they said it. Judging what an account means, comparing it with
other evidence, or deciding whether it is right, belongs to the people who read it. No part of the app scores
credibility, consistency or truthfulness.

## Models and data

| Component | Model or source | Role |
|---|---|---|
| Follow-up questions, on the device | Gemini Nano in Chrome, through Firebase AI Logic (`ONLY_ON_DEVICE`) | Proposes an anchor phrase and an open question |
| Follow-up questions, in the cloud | `gemini-3.5-flash-lite` through Firebase AI Logic (`ONLY_IN_CLOUD`), set in Remote Config | The same, when the witness chooses the cloud |
| The guard | Deterministic TypeScript and Kotlin, `core/src/guard.ts` and its port | Accepts a question only if every content word is the witness's and the question is open |
| Statement draft | `gemini-3.5-flash-lite` through Firebase AI Logic | Drafts first-person sentences, each citing the witness's quotes |
| Statement check | Deterministic code, `core/src/trace.ts` | Keeps only sentences built from their quotes |
| Read-back | `gemini-3.1-flash-tts-preview` through Firebase AI Logic | Reads the kept statement aloud |
| Seal | SHA-256 on the device; Firestore keeps the fingerprint and the server's time | Proves the account existed, unchanged, at that time |
| Evaluation accounts | 120 witness descriptions from Mickes (2018), UK Data Service, DOI 10.5255/UKDA-SN-853369, CC BY 4.0 | Measures the guard on real witnesses' words |

## Evaluation

The full method and results are in [`docs/EVALUATION.md`](EVALUATION.md). In short: 120 real witness descriptions,
a development set of 40 and a held-out set of 80, each answered by Gemini Nano on this device and by Gemini in the
cloud, with In Your Words' instruction and with a plain interviewer instruction. Every proposal is re-checked by the
guard offline, and the numbers in the README come from `eval/results-*.md`, which a test regenerates and compares on
every CI run.

## Human oversight

- Every question carries where it came from: the interview script, Gemini Nano on this device, Gemini in the cloud,
  or a fixed question.
- Every question the guard refused stays visible under the interview, with its foreign words struck through.
- The witness reads the whole account before sealing, and can keep writing.
- A drafted statement shows the quotes each sentence came from, and how many sentences were dropped.

## How a correction is made

Before sealing, the witness adds to any answer by continuing the interview. After sealing, a new account is a new
interview with its own seal and time; the first seal stays, so both moments remain provable.
