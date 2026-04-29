# Security Policy

For the architectural context — what amu defends against, where the trust boundary sits, and STRIDE-by-STRIDE coverage — see [`docs/THREAT_MODEL.md`](./docs/THREAT_MODEL.md). This file covers the **process**: how to report, what to expect, and how disclosure is handled.

---

## Supported versions

amu-http follows a strict supported-line policy.

| Version | Supported | Notes |
|---|---|---|
| 2.x (latest) | ✅ Active | New features land here. All security fixes. |
| 2.0-rc.x | ✅ Active | Treated as 2.0 for security purposes during the rc window. |
| 1.x | ⚠️ Security-only | Critical/High severity fixes only, until 2026-10-31. |
| < 1.x | ❌ Unsupported | Upgrade required. |

Once 2.x is generally adopted, 1.x moves to fully unsupported. Pin a major version in your `package.json` to avoid surprises.

---

## Reporting a vulnerability

**Do not open a public GitHub issue for security reports.** Don't post in Discussions. Don't tweet about it.

Use one of these private channels, in order of preference:

### 1 · GitHub Private Vulnerability Reporting (preferred)

https://github.com/lahin31/amu-http/security/advisories/new

This routes encrypted to maintainers and creates a private advisory thread.

### 2 · Encrypted email

Send to the email address listed on [the npm package page](https://www.npmjs.com/package/amu-http) (under "Author"). For sensitive reports, encrypt with the maintainer's public key:

```
PGP fingerprint:  [TODO before 2.0 GA — to be published with v2.0.0 announcement]
PGP key URL:      https://github.com/<maintainer>.gpg
```

If PGP is impractical, send a plain-text email **without proof-of-concept code**. Maintainers will respond with a secure channel for the PoC.

### 3 · Direct message to a maintainer

Discord (when amu has one), Twitter/Bluesky DMs to a verified maintainer account. Use only as a last resort if the above are unavailable; ask for a secure channel before sending the report.

---

## What to include in your report

Please provide as much of the following as you can:

- **Impact summary** — what an attacker can achieve
- **Affected versions** — which amu versions you've verified
- **Affected components** — specific module / middleware / function
- **Reproduction steps** — minimal PoC that demonstrates the issue
- **Suggested mitigation** — if you have one
- **Reporter info** — how you'd like to be credited (or anonymous)
- **Disclosure preference** — preferred timeline, embargo length

Reports without reproduction can still be triaged but take longer. PoC code accelerates the fix.

---

## Response SLO

Time-to-acknowledge (someone reads your report and responds): **best-effort 72 hours**. amu has a small maintainer team (currently single-maintainer); during travel / vacation periods, delays are possible.

| Stage | Target time |
|---|---|
| Acknowledgement | 72 hours |
| Initial assessment (severity rating, scope) | 7 days |
| Fix in progress / patch ETA communicated | 14 days |
| Patched version released | 7–30 days depending on severity (see below) |
| Public advisory published | After patch, with embargo coordination |

If you don't hear back in 7 days, escalate via a different channel (GitHub Discussion mentioning a maintainer asking *only* whether your report was received — no details).

---

## Severity classification

We use [CVSS v3.1](https://www.first.org/cvss/calculator/3.1) for severity ratings.

| Severity | CVSS v3.1 | Patch timeline |
|---|---|---|
| Critical | 9.0–10.0 | Patch within 7 days, embargo coordination, CVE assigned |
| High | 7.0–8.9 | Patch within 14 days |
| Medium | 4.0–6.9 | Patch within 30 days |
| Low | 0.1–3.9 | Patched in next minor release |

The maintainer's severity assessment is shared with the reporter; reporters may dispute and provide context. Final classification is based on real-world exploitability, not just CVSS score.

---

## Embargo policy

For Critical and High severity issues, we coordinate a private fix window with the reporter:

- **Standard embargo:** ≤ 30 days from acknowledgement to public disclosure.
- **Extended embargo:** up to 90 days if the fix requires coordination with downstream packages or runtimes.
- **Reporter veto:** the reporter may request an earlier disclosure if they believe the issue is being actively exploited; we accommodate.

During embargo:
- The fix is developed in a private fork or via GitHub's private Security Advisory branch feature.
- No public commits, issues, PR titles, or release notes hint at the issue.
- The patched version is published, *then* the public advisory is posted with full details.

For Medium/Low severity, embargo is informal — typically the reporter and maintainer agree to coordinated disclosure when the fix lands in a release.

---

## CVE assignment

amu-http uses GitHub Security Advisories for CVE assignment. GitHub is a CNA (CVE Numbering Authority); CVEs are assigned automatically when an advisory is published.

If a reporter has obtained a CVE through MITRE / a vendor first, that CVE is referenced in our advisory.

---

## Scope

### In scope (we treat as our responsibility)

- Bugs in `amu-http` source code that allow:
  - Code execution
  - Prototype pollution
  - Header / URL injection (CRLF, etc.)
  - Information disclosure (token leaks, PII leaks via default code paths)
  - Denial of service via untrusted input (response body, response headers, server-controlled values)
  - Type-system bypass that breaks documented runtime guarantees (e.g., `safe()` returning a value when it should be `Result<error>`)
- Bugs in default middleware that violate their documented contract (e.g., redaction not redacting, signing producing wrong signatures)
- Documented behavior that's actually unsafe (e.g., a recipe that leaks tokens) — we update the docs as a security fix

### Out of scope

- **Vulnerabilities in transitive dev dependencies.** Report those upstream. We monitor via Dependabot + CodeQL.
- **Vulnerabilities in optional peer dependencies.** Report to that project (`@opentelemetry/api`, etc.).
- **Misconfiguration by the application.** E.g., setting `allowNonIdempotent: true` and getting double-charged is documented behavior, not a vulnerability.
- **Server-side bugs.** A malicious server returning malformed responses that crash a misconfigured client is not amu's concern (we can advise hardening, but the server is out of our scope).
- **TLS / DNS / transport-level attacks.** These are runtime / OS / network responsibilities.
- **XSS / CSRF / CORS in user code that displays amu's responses.** Rendering is your job; amu is a fetch wrapper.
- **Theoretical issues without exploit potential.** We document what amu does and doesn't defend against in [THREAT_MODEL](./docs/THREAT_MODEL.md); arguments that "this *could* be bad" without a concrete attack are filed as enhancement requests, not security issues.

---

## Hall of Fame

Reporters who have contributed security fixes (with permission) are credited here:

*(Empty as of 2026-04. We will populate this with reporter handles, the CVE, and a short summary upon first disclosure.)*

---

## Compromise response

If amu's npm package is published with malicious content (token compromise, supply-chain attack):

| Time | Action |
|---|---|
| < 1 hour from confirmation | Malicious version `npm deprecate`'d with a security URL pointing to the advisory |
| < 24 hours | Clean patch published; GitHub Security Advisory; pinned-banner in README and CHANGELOG |
| < 7 days | Public post-mortem (GitHub Discussion + ADR if architectural) |
| As needed | npm token + provenance signing key rotated; documented in the post-mortem |

Users SHOULD:
- Pin amu version in `package.json` and `package-lock.json`
- Run `npm audit signatures` periodically to verify provenance
- Subscribe to GitHub Watch → Security alerts on this repo
- Use Dependabot or Renovate to flag amu version updates

---

## Recognition for confidential reporters

If you'd like to remain anonymous, your name is omitted from the advisory and Hall of Fame. If you'd like to be credited, your preferred handle (with optional link) appears in:

- The GitHub Security Advisory
- The CHANGELOG entry for the patch release
- The Hall of Fame section above

---

## Bug bounty

amu-http does not currently offer a paid bug bounty program. Recognition is via Hall of Fame and (when meaningful) public acknowledgement in release notes.

If a corporate sponsor wants to fund a bug bounty for amu, reach out to the maintainer.
