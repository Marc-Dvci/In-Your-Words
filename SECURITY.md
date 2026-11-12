# Security

Please report a vulnerability through
[GitHub's private reporting](https://github.com/Marc-Dvci/In-Your-Words/security/advisories/new), not in a public issue.
The supported version is the `main` branch and the hosted [live site](https://in-your-words-2026.web.app).

The reports that matter most are anything that:

- stores or transmits a witness's words where the product says only a fingerprint goes (`firebase/firestore.rules`);
- overwrites or back-dates a seal: a seal is written once, with the server's time;
- reads a handover without its code: the server holds only AES-GCM ciphertext;
- calls Firebase AI Logic from outside the app, past App Check.
