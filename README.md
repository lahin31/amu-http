# Amu

[![npm version](https://img.shields.io/npm/v/amu-http.svg?logo=npm&label=npm)](https://www.npmjs.com/package/amu-http)
[![npm downloads](https://img.shields.io/npm/dw/amu-http?logo=npm&label=downloads)](https://www.npmjs.com/package/amu-http)
[![bundle size](https://img.shields.io/bundlephobia/minzip/amu-http?label=gzip)](https://bundlephobia.com/package/amu-http)
[![types](https://img.shields.io/npm/types/amu-http)](https://www.npmjs.com/package/amu-http)
[![license](https://img.shields.io/npm/l/amu-http)](https://github.com/lahin31/amu-http/blob/main/LICENSE)

**Amu** is a Fetch-first HTTP client for modern JavaScript and TypeScript apps.

It keeps native Fetch behavior while removing the boilerplate that slows teams down in real-world systems.

Safer URL handling by default: strict URL parsing (syntax-level validation only) rejects malformed absolute URLs instead of silently normalizing them.

## Table of Contents

**Getting started**

- [Installation](#-installation)
- [Quick Example](#-quick-example)

**Overview & comparison**

- [Why Amu](#-why-amu)
- [Amu vs Axios](#️-amu-vs-axios)
- [Killer Features](#-killer-features)
- [Core Features](#-core-features)

**Making requests**

- [Overview](#-usage)
 - [Basic GET](#basic-get)
 - [Axios-style Raw Response](#axios-style-raw-response)
 - [POST (JSON)](#post-json)
 - [PUT / PATCH / DELETE](#put--patch--delete)
 - [Query Params](#query-params)
 - [Headers / Auth](#headers--auth)
 - [Request Cancellation (AbortController)](#request-cancellation-abortcontroller)
 - [Debug Latency](#debug-latency)

**Timeouts, retries & URL safety**

- [Timeout & Retries](#timeout--retries)
- [URL Safety](#-url-safety)

**Errors & behavior**

- [Error Handling](#️-error-handling)
- [Network Errors](#-network-errors)
- [Failure Behavior Spec](#failure-behavior-spec)

**Advanced**

- [Schema Validation](#-schema-validation)
- [Custom Instance](#-custom-instance)

**Reference**

- [Size](#-size)
- [Design Principles](#-design-principles)
- [Development](#-development)

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
  credentials: 'include', // include cookies/credentials for cross-site auth
});
```

> Include credentials when the request needs cookies or browser auth data.

---

### Request Cancellation (AbortController)

```ts
import amu from 'amu-http';

const controller = new AbortController();
const promise = amu.get('/users', { signal: controller.signal });

controller.abort();
await promise; // throws AmuNetworkError with kind: 'abort'
```

`signal` works together with `timeout`: whichever aborts first cancels the request.

---

### Debug Latency

Set `debug: true` to print request latency in the console.

```ts
import amu from 'amu-http';

await amu.get('/users', { debug: true });
// [amu][latency] GET /users 128ms attempts=1 status=200
```

`debug` works on both instance defaults and per-request config.

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

Retry lifecycle hooks (instance-level + request override):

```ts
import amu from 'amu-http';

const api = amu('https://api.example.com', {
  retries: {
    attempts: 3,
    delay: (attempt) => 2 ** attempt * 100,
    retryOn: ['network-error', 429, 500, 502, 503, 504],
  },
  hooks: {
    onRetry(ctx) {
      console.log('retry', ctx.attempt, ctx.reason, ctx.delay);
    },
    onRetryComplete(ctx) {
      console.log('retry-complete', ctx.success, ctx.totalRetries, ctx.totalDuration);
    },
  },
});

await api.get('/stats', {
  hooks: {
    onRetry(ctx) {
      // Request-level hooks override same-named instance hooks.
      console.log('request retry', ctx.attempt);
    },
  },
});
```

Hook behavior:
- `onRetry` fires each time a retry is scheduled (before backoff sleep).
- `onRetryComplete` fires once when retry workflow finishes (final success or final failure).
- `onRetryComplete` fires only if at least one retry happened.

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
npm run lint
npm run test
npm run test:watch
npm run test:coverage
npm run build
npm run dev
```