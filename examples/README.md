# Examples

Two account files a judge can check without running anything: open the
[verify page](https://in-your-words-2026.web.app), choose "Check a sealed account", and drop either file.

| File | What it is | What the verify page says |
|---|---|---|
| [`sealed-account.json`](sealed-account.json) | An interview recorded on the live site, with Gemini Nano writing the follow-ups on the device, then sealed. Firestore keeps its fingerprint and the server's time | Unchanged since it was sealed, with the sealed time |
| [`tampered-account.json`](tampered-account.json) | The same file with one answer edited: "white, maybe round" became "red, maybe square" | Changed after it was sealed, with both rosettes drawn |

Each file holds every question asked, where it was written (`script`, `on_device`, `in_cloud` or `template`), every
answer, and the fingerprint computed from them.
