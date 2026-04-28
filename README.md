# Amu

[![npm version](https://img.shields.io/npm/v/amu-http.svg?logo=npm&label=npm)](https://www.npmjs.com/package/amu-http)
[![npm downloads](https://img.shields.io/npm/dm/amu-http.svg)](https://www.npmjs.com/package/amu-http)
[![bundle size](https://img.shields.io/bundlephobia/minzip/amu-http?label=gzip)](https://bundlephobia.com/package/amu-http)
[![types](https://img.shields.io/npm/types/amu-http.svg)](https://www.npmjs.com/package/amu-http)
[![CI](https://github.com/lahin31/amu-http/actions/workflows/ci.yml/badge.svg)](https://github.com/lahin31/amu-http/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/amu-http.svg)](./LICENSE)

**Amu** is a Fetch-first HTTP client for modern JavaScript and TypeScript apps.

It keeps native Fetch behavior while removing the boilerplate that slows teams down in real-world systems.

Safer URL handling by default: strict URL parsing (syntax-level validation only) rejects malformed absolute URLs instead of silently normalizing them.

---

## 📦 Installation

```bash
npm install amu-http
```

---

## ⚡ Quick Example

```ts
// Native Fetch
const res = await fetch('/users');
if (!res.ok) throw new Error('Request failed');
const users = await res.json();

// Axios
const res2 = await axios.get('/users');
const users2 = res2.data;

// Amu
const users3 = await amu.get('/users');
```

---

## 💡 Why Amu

- Direct data access (no `res.data`)
- Deterministic retries (network errors by default; configurable status-code retries)
- Structured errors (HTTP + network)
- URL safety (strict URL parsing, syntax-level validation only)
- Schema validation support
- Tiny footprint (~1.6KB gzip)

Amu is a thin, opinionated layer over Fetch with explicit, testable behavior:

- Throws on non-2xx responses (`AmuError`) instead of returning `ok: false` responses.
- Retries only idempotent methods (`GET`, `HEAD`) by default.
- Rejects malformed absolute URLs early (`AmuUrlError`).

It also has two standout capabilities:

- **Structured Network Errors** (`AmuNetworkError`) for reliable retry/debug logic
- **Built-in Schema Validation** for runtime-safe API parsing

---

## ⚖️ Amu vs Axios

| Feature              | Amu                     | Axios                |
|---------------------|--------------------------|----------------------|
| Data access         | Direct (`await get()`)   | `res.data`           |
| Fetch-native        | ✅                        | ❌ (adapters)        |
| Retry semantics     | HTTP-aware               | Manual               |
| Error structure     | Typed & structured       | Less structured      |
| URL validation      | Strict                   | Lenient              |
| Bundle size         | ~1.6KB (gzip)            | ~14KB (gzip)         |

---

## 🎯 Killer Features

### 1) Structured Network Errors

Amu provides a dedicated `AmuNetworkError` with:
- `kind` (`network | timeout | abort | unknown`)
- `isRetryable`
- `cause`

This gives you predictable retry and debugging behavior without guessing from generic `"Network Error"` strings.

### 2) Built-in Schema Validation

Amu supports validator-driven parsing at the request layer:
- Zod-style schema support (via `.parse` interface) + custom validators
- custom validation functions

You get runtime data-shape guarantees at the boundary where APIs enter your app.

---

## 🧠 Core Features

- Auto JSON / text parsing  
- Built-in timeout support  
- Retry policies with full control  
- Query params support  
- Schema validation (Zod + custom)  
- Instance-based client factory  
- Tiny footprint for browser & server  

---

## 🚀 Usage

### Basic GET

```ts
import amu from 'amu-http';

const users = await amu.get('https://jsonplaceholder.typicode.com/users');
```

---

### Axios-style Raw Response

If you prefer Axios-like response objects, pass `raw: true`.

```ts
import amu from 'amu-http';

const res = await amu.get('/users', { raw: true });

console.log(res.data); // parsed payload
console.log(res.status); // HTTP status code
console.log(res.statusText); // HTTP status text
console.log(res.headers); // plain header object
console.log(res.config); // resolved request config
console.log(res.request); // native Fetch Response
```

With schema validation, `res.data` is still validated:

```ts
const res = await amu.get('/user/1', {
  raw: true,
  schema: UserSchema,
});
```

---

### POST (JSON)

```ts
import amu from 'amu-http';

await amu.post('/posts', {
  title: 'hello',
  body: 'from amu',
});
```

---

### PUT / PATCH / DELETE

```ts
import amu from 'amu-http';

await amu.put('/users/1', { name: 'Updated Name' });
await amu.patch('/users/1', { role: 'admin' });
await amu.delete('/users/1');
```

---

### Query Params

```ts
import amu from 'amu-http';

await amu.get('/users', {
  params: { page: 1, limit: 10 },
});
```

You can also pass query params directly in the URL:

```ts
const users = await amu.get('/users?page=1&limit=10');
```

Mixing URL query + `params` also works:

```ts
await amu.get('/users?page=1', {
  params: { limit: 10 },
});
// Final URL: /users?page=1&limit=10
```

---

### Headers / Auth

```ts
import amu from 'amu-http';

await amu.get('/me', {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

---

### Timeout & Retries

```ts
import amu from 'amu-http';

await amu.get('/stats', {
  timeout: 5000,
  retries: 2,
});
```

Advanced retry:

```ts
await amu.get('/stats', {
  retries: {
    attempts: 3,
    delay: (attempt) => 2 ** attempt * 100,
    retryOn: ['network-error', 429, 500, 502, 503, 504],
  },
});
```

---

## ❌ URL Safety

Amu performs strict URL parsing (syntax-level validation only) and rejects malformed absolute URLs.

```ts
await amu.get('https:google.com'); // throws AmuUrlError
await amu.get('https://google.com'); // valid
```

---

## ⚠️ Error Handling

```ts
import amu, { AmuError } from 'amu-http';

try {
  await amu.get('/404');
} catch (err) {
  if (err instanceof AmuError) {
    console.log(err.status);
    console.log(err.data);
    console.log(err.headers);
  }
}
```

---

## 🌐 Network Errors

```ts
import amu, { AmuNetworkError } from 'amu-http';

try {
  await amu.get('/users');
} catch (err) {
  if (err instanceof AmuNetworkError) {
    console.log(err.kind); // network | timeout | abort | unknown
    console.log(err.isRetryable);
    console.log(err.cause);
  }
}
```

---

## Failure Behavior Spec

Amu has explicit failure semantics:

- **HTTP 4xx/5xx (e.g. 404, 500)**  
  Throws `AmuError` with:
  - `status`: HTTP status code
  - `data`: parsed response body (JSON/text/null)
  - `headers`: response headers

- **Network failure (DNS/offline/unreachable transport)**  
  Throws `AmuNetworkError` with:
  - `kind: 'network'`
  - `isRetryable` based on retry policy
  - `cause`: original underlying error

- **Timeout**  
  Throws `AmuNetworkError` with:
  - `kind: 'timeout'`
  - `isRetryable: false` by default

- **Abort**  
  Throws `AmuNetworkError` with:
  - `kind: 'abort'`
  - `isRetryable: false` by default

- **Schema validation failure**  
  Throws `AmuValidationError` with:
  - `data`: unvalidated response payload
  - `issues`: validator-provided issues (if available)

- **Malformed absolute URL (e.g. `https:google.com`)**  
  Throws `AmuUrlError` before request execution.

Retry defaults:
- Network errors are retryable when configured via `retries`.
- HTTP status retries happen only when status codes are listed in `retryOn`.
- Retries are idempotent-method-only by default (`GET`, `HEAD`) unless `allowNonIdempotent: true`.

---

## 🧪 Schema Validation

```ts
import amu from 'amu-http';
import { z } from 'zod';

const User = z.object({
  id: z.number(),
  name: z.string(),
});

const user = await amu.get('/user/1', {
  schema: User,
});
```

---

## 🏭 Custom Instance

```ts
import amu from 'amu-http';

const api = amu('https://api.example.com', {
  timeout: 8000,
  retries: 1,
  headers: {
    'X-App': 'dashboard',
  },
});

await api.get('/me');
```

---

## 📏 Size

- **Amu (gzip)**: ~1.6 KB  
- **Axios (gzip)**: ~14 KB  

Amu is ~9x smaller while keeping essential features for modern runtimes.

---

## 🧠 Design Principles

- Minimal abstraction over Fetch  
- Predictable behavior over magic  
- Correct defaults over configuration  
- Small surface area over feature bloat  
- Production-safe by design  

---

## 🛠 Development

```bash
npm ci                 # installs deps and registers pre-commit hook
npm run lint           # biome check
npm run typecheck      # tsc --noEmit
npm test               # vitest — unit + browser + type tests
npm run bench          # microbenchmarks
npm run build          # tsdown → dist/
npm run verify         # publint + attw
npm run size           # size-limit (gzip budget)
```

Releases are managed via [Changesets](https://github.com/changesets/changesets) — run `npx changeset` to record a version bump with any user-facing change. Publishing to npm happens automatically on merge of the generated version PR (with [npm provenance](https://docs.npmjs.com/generating-provenance-statements)).

For the full development guide — tooling, test categories, CI matrix (Node 18/20/22, TypeScript 5.5/5.8/6.0, Bun, Deno, CodeQL), release workflow, JSR publishing, and code conventions — see [CONTRIBUTING.md](CONTRIBUTING.md). For security disclosures see [SECURITY.md](SECURITY.md).