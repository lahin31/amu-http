# amu-http threat model

What amu defends against, what it doesn't, and where the trust boundary sits. STRIDE-categorized so security reviewers can audit it cleanly.

For vulnerability disclosure, see [SECURITY.md](../SECURITY.md).

---

## Trust boundary

```
┌──────────────────────────────────────────────────────────┐
│  Your code (untrusted from amu's perspective for input)  │
│   ↓                                                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │  amu (defends what it can; documents what it can't)│  │
│  │   ↓                                                │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  FetchImpl boundary  (runtime's responsibility) │ │
│  │  │   ↓                                          │  │  │
│  │  │  Network (untrusted)                         │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

amu defends the middle band. The outer band (your code) and inner band (runtime fetch + TLS + DNS) are out of scope.

---

## STRIDE summary

| Category | What amu defends | What amu does NOT defend |
|---|---|---|
| **S**poofing | URL malformedness rejection, schema validation prevents shape impersonation | Server identity (TLS pinning is your concern), bearer-token theft (your storage) |
| **T**ampering | Response schema validation catches silent contract drift, `AmuError` carries headers for cross-checking | In-transit tampering (TLS handles), middleware tampering (you trust your middleware) |
| **R**epudiation | requestId stamping, OTel propagation, structured logging | Server-side audit (your concern) |
| **I**nformation disclosure | Authorization redacted in default logger, PII redaction utilities (Phase B), no URL secret leakage in error messages | XSS via user-controlled URLs displayed as HTML, side-channel attacks |
| **D**enial of service | Body size cap (Phase A), retry budgets, circuit breaker, timeout middleware, bulkhead | Network-level DoS (network's concern), TCP SYN flood, slowloris |
| **E**levation of privilege | Capability-restricted clients (Phase B), strict idempotency rules | Compromised middleware, supply-chain attacks |

Below: each row in detail.

---

## S — Spoofing

### What amu defends

| Threat | Mitigation | Where |
|---|---|---|
| Malformed URLs interpreted as relative paths | `validateProtocolSlashes()` rejects `https:google.com` (missing slashes) with `AmuUrlError` and a typo suggestion | `src/url.ts` |
| Server returns a JSON shape different from what your code expects | `schema.response` validates at runtime; throws `AmuValidationError` with structured issues | `src/middleware/validate.ts` |
| Server returns wrong status code unexpectedly | `AmuError.status` is the literal HTTP status from the wire (not normalized) | `src/middleware/parse.ts` |
| Wrong content-type spoofs a different format | `parse` middleware honors `Content-Type` header and falls back to text on mismatch | `src/middleware/parse.ts` |

### What amu does NOT defend

- **Server identity** — TLS handles authenticity. amu does not implement certificate pinning. For high-trust paths, configure pinning at the dispatcher level (Node) or use platform mechanisms (HPKP / mobile native).
- **Bearer token theft** — amu reads tokens from a callable; if the callable returns an attacker-supplied value (e.g., from a compromised store), amu can't tell.
- **DNS rebinding** — runtime's responsibility. Use HTTPS + Strict-Transport-Security on the server.
- **CSRF on cross-origin GETs** — server-side concern. amu's `csrf` middleware (Phase B) reads a CSRF cookie and sends it as a header for state-changing requests; this is the *defense-in-depth* layer, not the primary defense (which lives on the server).

---

## T — Tampering

### What amu defends

| Threat | Mitigation |
|---|---|
| Wire-format tampering goes undetected | `schema.response` runtime validation surfaces silent contract drift (e.g., a field's type changing) |
| Cookie tampering | `Secure` cookies dropped over plain HTTP in our cookie jar |
| Response body silently truncated | `Content-Length` checked when present; partial body raises during stream consumption |
| Header injection (CRLF) via dynamic header values | `withHeader` uses native `Headers.set()` which rejects CRLF per spec; `setHeader` from user input is safe by default |

### What amu does NOT defend

- **In-transit tampering** — TLS prevents this. amu requires HTTPS by convention but does not enforce it (your `baseURL` config decides).
- **Middleware tampering** — you trust the middleware you install. A malicious middleware in your chain can do anything (read tokens, modify URLs, leak data).
- **Subresource integrity for fetched assets** — Phase B will add `expectHash: 'sha256-...'` validating the response body. Until then, you must verify hashes yourself.

---

## R — Repudiation

### What amu defends

| Threat | Mitigation | Where |
|---|---|---|
| Inability to correlate a client request with server logs | `requestId` middleware stamps `X-Request-ID` (configurable header / generator) | `src/middleware/requestId.ts` |
| Inability to trace across services | `otel` middleware injects W3C Trace Context (`traceparent`, `tracestate`) | `src/middleware/otel.ts` |
| Loss of error context after middleware unwinds | `AmuAnyError` instances carry structured fields (status, kind, data, issues) — not just message strings | `src/errors/*` |

### What amu does NOT defend

- **Server-side audit log integrity** — server's responsibility.
- **Non-repudiation in legal sense** — message signing (Phase B AWS SigV4 / HMAC middleware) is *integrity*, not signed-statement non-repudiation. For legally-binding non-repudiation use a signed-statement protocol (e.g., COSE / JWS) outside amu.

---

## I — Information disclosure

### What amu defends

| Threat | Mitigation | Where |
|---|---|---|
| `Authorization` header leaks into logs | Default `logger` middleware redacts `authorization` → `<redacted>` in verbose mode | `src/middleware/logger.ts` |
| Tokens / cookies displayed in error messages | `AmuError.message` is `Request failed with status N <statusText>` — never the request body or headers |
| URL secrets logged | (Phase B) URL secret detector warns dev-mode if `password=`, `token=`, `api_key=`, `secret=` query parameters appear |
| PII in body logs | (Phase B) `redact` middleware deep-walks objects and applies a configurable pattern registry (cards, JWTs, SSNs, emails-as-PII) |
| Error responses leak server internals | `AmuError.data` carries server's response body verbatim — *you* decide what to log |

### What amu does NOT defend

- **XSS via user-controlled URLs displayed as HTML** — amu fetches; rendering is your concern.
- **Side-channel attacks** — timing differences, cache-line leaks, etc. amu makes no constant-time guarantees.
- **Log destination security** — if you pipe logs to a destination an attacker can read, that's your problem; redaction reduces blast radius but doesn't eliminate it.

---

## D — Denial of service

### What amu defends

| Threat | Mitigation | Where |
|---|---|---|
| Buggy upstream returns 500 MB JSON, OOMs the pod | Body size cap (`maxResponseSize`) throws `AmuNetworkError` if `Content-Length` exceeds, or counts bytes off the stream | Phase A |
| Retry storm during a partial outage amplifies the outage | Retry budgets (`budget: { ratio, window }`) skip retries when too many in flight | Phase A |
| Slow downstream consumes all in-flight slots | `bulkhead({ maxConcurrent })` queues / rejects beyond the limit | Phase A (`amu-http/middleware/bulkhead`) |
| Flapping downstream causes traffic amplification | Circuit breaker (`circuit({ failureThreshold, halfOpenAfter })`) opens on failure rate | Phase A (`amu-http/middleware/circuit`) |
| Hung connections | Per-request `timeout` middleware aborts via `AbortSignal` | `src/middleware/timeout.ts` |
| Server-controlled retry-after header ignored | Retry middleware honors `Retry-After` (Phase A) — overrides the configured delay function |

### What amu does NOT defend

- **Network-level DoS** — TCP SYN flood, ICMP, application-level slowloris. Out of scope.
- **Memory pressure from middleware state** — if you install a cookie jar that never expires entries, it grows unbounded. Use the default jar's expiration handling or implement your own size cap.
- **CPU pressure from heavy schema validation** — if your schema does expensive transforms on every page of paginated data, that's your CPU cost. amu will not warn.

---

## E — Elevation of privilege

### What amu defends

| Threat | Mitigation | Where |
|---|---|---|
| Plugin needs only specific paths but accidentally has full client access | Capability-restricted clients via `createClient.restricted({ allowedPaths, allowedMethods })` | Phase B |
| Unsafe-method retries cause double-charges (POST retried without idempotency) | Default: only safe methods (GET/HEAD/OPTIONS) retry. `allowNonIdempotent: true` is opt-in with documented warning | `src/middleware/retry.ts` |
| Compromised middleware sees all bearer tokens | All middleware receives the full RequestContext — there is no privilege isolation between middleware. **Mitigation: trust review of every middleware before installation.** | n/a — architectural |

### What amu does NOT defend

- **Compromised middleware** — by design, middleware has full read/write access to RequestContext including tokens. amu provides no sandboxing. Vet your middleware.
- **Compromised peer dependencies** — supply-chain attacks. CodeQL + npm provenance + Dependabot reduce risk; do not eliminate it.
- **Privilege escalation via prototype pollution** — amu's source uses `Object.freeze()` for context objects but does not enforce immutability deep into untyped JSON parsed from responses. If your code reads `response.data.__proto__`, that's on you.

---

## Out-of-scope (delegated by design)

Things amu explicitly does not defend, and where the responsibility lives:

| Out of scope | Lives where |
|---|---|
| TLS handshake correctness | Runtime fetch / undici dispatcher |
| Certificate validation / pinning | Runtime / `Agent` configuration / mobile platform |
| DNS resolution security | OS / dispatcher |
| HTTP/2 framing security | undici / browser |
| WebSocket security | Out of scope (separate protocol) |
| Browser CORS enforcement | Browser / server `Access-Control-*` headers |
| CSP enforcement | Browser / page `Content-Security-Policy` |
| OAuth flow correctness | OAuth library — amu only ships `bearerAuth` and `refreshOn401` patterns |
| JWT validation / decoding | Use `jose` |
| Server-side authorization / RBAC | Server's job |
| Rate limit enforcement at provider | Provider's job; amu's outbound rate limiter is *self-throttling*, not enforcement |

---

## Vulnerability response process

For full disclosure procedure, see [SECURITY.md](../SECURITY.md). Summary:

1. **Report** — GitHub Private Vulnerability Reporting OR encrypted email to maintainer.
2. **Acknowledgement** — within 72 hours (best-effort; single maintainer today).
3. **Initial assessment** — within 7 days.
4. **Coordinated fix + disclosure** — typical 7–30 days depending on severity.
5. **Embargo** — coordinated disclosure window negotiated with reporter.
6. **CVE assignment** — via GitHub Security Advisory.
7. **Credit** — given unless reporter prefers anonymity.

### Severity classification

We use [CVSS v3.1](https://www.first.org/cvss/) for severity ratings.

| Severity | Response time |
|---|---|
| Critical (9.0–10.0) | Patch within 7 days, embargo coordination |
| High (7.0–8.9) | Patch within 14 days |
| Medium (4.0–6.9) | Patch within 30 days |
| Low (0.1–3.9) | Patch in next minor |

---

## Security commitments

What we commit to as a project:

1. **No telemetry phone-home.** amu collects no usage data, sends no diagnostics, makes no network calls outside what your code asks for.
2. **No global registration.** Importing amu does not register globals, install service workers, modify prototypes, or schedule timers.
3. **No `eval`, no `Function(...)`, no dynamic code generation** in `src/`. Verified by Biome `noGlobalEval`.
4. **No `process.env` checks at runtime.** No secrets leak via env-var inspection.
5. **No supply-chain bundling** of unaudited code. Zero runtime deps. Optional peer deps documented.
6. **CodeQL + Dependabot** active on the repo.
7. **npm provenance** on every published version.
8. **CHANGELOG entry for every security fix**, with CVE link.

---

## Compromise response (what we do if amu itself is compromised)

If amu's npm package is published with malicious content (token compromise, supply chain attack on our deps):

1. **Detection** — community report, npm security alert, or CodeQL flag.
2. **Within 1 hour of confirmation** — npm `deprecate` the malicious version with a security URL.
3. **Within 24 hours** — publish a clean patch version, GitHub Security Advisory, and an issue at the top of README with mitigation steps.
4. **Within 7 days** — post-mortem published as a GitHub Discussion + ADR.
5. **Token rotation** — npm token rotated; provenance signing key rotated; documented in the post-mortem.

Users are advised to:
- Pin versions in `package.json` and `package-lock.json`.
- Use `npm audit signatures` to verify provenance attestations.
- Subscribe to GitHub Watch → Security alerts on this repo.
- Add Dependabot or Renovate to flag amu version updates.
