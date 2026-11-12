# Evaluation

The question this measures: when a model writes a follow-up question for a witness, how often would that question
put a word in the witness's mouth, or ask for a yes or a no? And what reaches the witness once the guard checks it?

## Data

120 written descriptions by participants of a published eyewitness study: after watching a mock-crime video, each
participant described the perpetrator in their own words (Mickes, 2018, *New ways to improve eyewitness
identifications using receiver operating characteristics analysis 2015-2018*, UK Data Service,
[DOI 10.5255/UKDA-SN-853369](https://doi.org/10.5255/UKDA-SN-853369), CC BY 4.0). From the 1,827 descriptions of 15 to
160 words, a seeded shuffle (seed 20261112) drew a development set of 40 and a held-out set of 80:
[`eval/data/`](../eval/data). The held-out set was read for the first time by the final run below.

Each description is the witness's answer to the People phase opening ("Tell me about each person you saw. Describe
them in as much detail as you can."), so the request each model receives is exactly the one the app sends.

## Configurations

Every description goes to four configurations of the same Firebase AI Logic hybrid model:

| Configuration | Where it runs | Instruction |
|---|---|---|
| Gemini Nano, plain prompt | Chrome's built-in model, `ONLY_ON_DEVICE` | An ordinary interviewer instruction: ask one follow-up question to help them remember more |
| Gemini cloud, plain prompt | `gemini-3.5-flash-lite`, `ONLY_IN_CLOUD` | The same |
| Gemini Nano, In Your Words | Chrome's built-in model, `ONLY_ON_DEVICE` | The app's instruction (`SYSTEM_PROMPT` in `core/src/interview.ts`) |
| Gemini cloud, In Your Words | `gemini-3.5-flash-lite`, `ONLY_IN_CLOUD` | The same |

The plain prompt is never used by the app. It measures what the guard protects against.

The runs were recorded on 12 November 2026, in Chrome 157 on a desktop with an RTX 4070, through the app's own
`HybridEngine` ([`web/src/eval/run.ts`](../web/src/eval/run.ts)). Raw outputs, times and the reported
`inferenceSource` of every call are in [`eval/runs/`](../eval/runs).

## Scoring

[`eval/score.ts`](../eval/score.ts) re-reads every saved proposal, offline: it runs the guard on the proposed
question against the witness's words, then runs the app's `decide()` to get the question the witness would actually
see. [`eval/score.test.ts`](../eval/score.test.ts) regenerates the tables below on every CI run and fails if they
change, if any shown question fails the guard, or if any call reports a different `inferenceSource` from the path
it was sent to.

```sh
npx vitest run eval
```

## Held-out set (80 descriptions)

| heldout | Gemini Nano, plain prompt | Gemini cloud, plain prompt | Gemini Nano, In Your Words | Gemini cloud, In Your Words |
|---|---|---|---|---|
| Proposals | 80 | 80 | 80 | 80 |
| Accepted as written | 0 (0 %) | 39 (49 %) | 70 (88 %) | 80 (100 %) |
| Refused: words the witness never used | 79 (99 %) | 1 (1 %) | 6 (8 %) | 0 (0 %) |
| Refused: yes-or-no question | 79 | 40 | 0 | 0 |
| Refused: offers options | 63 | 1 | 2 | 0 |
| Refused: misquotes the witness | 0 | 0 | 0 | 0 |
| Replaced by the anchor question | 47 | 38 | 8 | 0 |
| Replaced by the generic question | 33 | 3 | 2 | 0 |
| Shown to the witness and refused by the guard | 0 | 0 | 0 | 0 |
| Median time per question | 2.5 s | 1.7 s | 2.4 s | 1.6 s |
| 90th percentile | 2.9 s | 4.5 s | 2.8 s | 3.9 s |

## Development set (40 descriptions)

| dev | Gemini Nano, plain prompt | Gemini cloud, plain prompt | Gemini Nano, In Your Words | Gemini cloud, In Your Words |
|---|---|---|---|---|
| Proposals | 40 | 38 | 40 | 38 |
| Accepted as written | 0 (0 %) | 14 (37 %) | 39 (98 %) | 38 (100 %) |
| Refused: words the witness never used | 40 (100 %) | 2 (5 %) | 1 (3 %) | 0 (0 %) |
| Refused: yes-or-no question | 40 | 22 | 0 | 0 |
| Refused: offers options | 35 | 1 | 0 | 0 |
| Refused: misquotes the witness | 0 | 0 | 0 | 0 |
| Replaced by the anchor question | 28 | 23 | 1 | 0 |
| Replaced by the generic question | 12 | 1 | 0 | 0 |
| Shown to the witness and refused by the guard | 0 | 0 | 0 | 0 |
| Median time per question | 1.7 s | 1.3 s | 1.7 s | 1.7 s |
| 90th percentile | 2.1 s | 11.3 s | 1.9 s | 10.2 s |
