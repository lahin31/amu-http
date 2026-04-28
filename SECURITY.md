# Security Policy

## Supported Versions

The latest minor release on `main` is the only line that receives security fixes. Older versions are not patched.

| Version | Supported |
|---|---|
| 1.x (latest) | ✅ |
| < 1.x | ❌ |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security reports.**

Instead, use one of these private channels:

1. **GitHub Private Vulnerability Reporting** (preferred): https://github.com/lahin31/amu-http/security/advisories/new
2. Email the maintainer directly at the address listed on the npm package page.

Please include:
- A description of the vulnerability and its impact
- Steps to reproduce (PoC code is appreciated)
- The affected version(s)
- Any suggested mitigation

## Response Process

- **Acknowledgement**: within 72 hours
- **Initial assessment**: within 7 days
- **Fix + coordinated disclosure**: depends on severity, typically 7–30 days

You will be credited in the release notes and security advisory unless you prefer to remain anonymous.

## Scope

In scope:
- Code-execution, prototype-pollution, or DoS bugs in `amu-http` itself
- Type/runtime mismatches that allow users to bypass documented safety guarantees (URL validation, schema validation, error classes)

Out of scope:
- Vulnerabilities in transitive dev dependencies (those go to the upstream project)
- Application-layer issues caused by misconfiguration of `amu-http` (e.g. retrying non-idempotent methods deliberately)
- Issues that require a malicious server response that is itself the vulnerability surface (e.g. you must validate untrusted JSON yourself with `schema:`)

## Disclosure Policy

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). Please do not publish details of the vulnerability until a patched release is available.
