# amu

[![npm version](https://img.shields.io/npm/v/amu-http.svg?logo=npm&label=npm)](https://www.npmjs.com/package/amu-http)
[![bundle size](https://img.shields.io/bundlephobia/minzip/amu-http?label=gzip)](https://bundlephobia.com/package/amu-http)
[![types](https://img.shields.io/npm/types/amu-http.svg)](https://www.npmjs.com/package/amu-http)
[![CI](https://github.com/lahin31/amu-http/actions/workflows/ci.yml/badge.svg)](https://github.com/lahin31/amu-http/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/amu-http.svg)](./LICENSE)

**The most type-safe HTTP client in JavaScript.** Universal (Node 20.3+, browsers, Workers, edge, Deno, Bun). 3.5 KB gzip core. Zero dependencies.

```ts
import { createClient } from 'amu-http'
import { z } from 'zod'

const api = createClient({ baseURL: 'https://api.example.com' })

const User = z.object({ id: z.number(), name: z.string() })

const user = await api.get('/users/:id', {
  params: { id: 1 },                       // ← required, type-checked from `:id`
  schema: { response: User },              // ← validated at runtime
})
//    ^? z.infer<typeof User>              // ← type follows the schema
```

---

## Three things no other HTTP client does

### 1. Response *and* request body types follow your schemas
```ts
const created = await api.post('/users', payload, {
  schema: { body: CreateUser, response: User },
  // payload typed against CreateUser at compile time AND validated at runtime
  // before the request leaves your machine
})
//    ^? z.infer<typeof User>
```
Works with **Zod 3.24+, Valibot 0.31+, ArkType 2+** — anything implementing [Standard Schema](https://standardschema.dev).

### 2. Type-safe URL parameters
```ts
api.get('/users/:id/posts/:postId', {
  params: { id: 1, postId: 'abc' },        // both required by the type
})
api.get('/users/:id', {})                  // ❌ compile error: missing params.id
```

### 3. Discriminated errors, exhaustively narrowable
```ts
const result = await api.safe.get('/u/1', { schema: { response: User } })

if (!result.ok) {
  switch (result.error.name) {
    case 'AmuError':            // HTTP non-2xx — narrow `.status`
    case 'AmuNetworkError':     // 8 kinds: dns | connect | tls | timeout-active | timeout-idle | abort | reset | unknown
    case 'AmuUrlError':         // malformed URL caught locally
    case 'AmuValidationError':  // schema mismatch — `.target: 'request' | 'response'`, `.issues`
    case 'AmuUnknownError':     // catch-all for non-amu errors thrown by middleware
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
  // TypeScript errors if you miss a case.
}
```

---

## Install

```bash
npm i amu-http zod    # or valibot, or arktype, or none — schemas are optional
```

Requires **Node ≥ 20.3** (uses native `AbortSignal.any`). ESM-only.

---

## Why amu vs the alternatives

| | amu | ky | ofetch | wretch | got | fetch | axios |
|---|---|---|---|---|---|---|---|
| Schema-inferred response | **✅** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Schema-validated request body | **✅** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Type-safe URL params | **✅** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Discriminated network errors | **✅** | ❌ | ❌ | ❌ | partial | ❌ | ❌ |
| `Result<T>` / safe API | **✅** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Streaming (SSE / NDJSON) | **✅** | ❌ | ❌ | ❌ | ✅ | manual | ❌ |
| First-party mock client | **✅** | ❌ | ❌ | ❌ | ❌ | ❌ | external |
| Middleware | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Universal | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Gzip core | **3.5 KB** | ~4 KB | ~6 KB | ~3 KB | ~50 KB | 0 | ~14 KB |

Bolded rows are amu-only.

---

## Cookbook

### GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS
```ts
await api.get('/users')
await api.post('/users', { name: 'Ada' })
await api.put('/users/:id', { name: 'Ada' }, { params: { id: 1 } })
await api.patch('/users/:id', { name: 'Ada' }, { params: { id: 1 } })
await api.delete('/users/:id', { params: { id: 1 } })
```

### Default singleton for one-liners
```ts
import { amu } from 'amu-http'
const data = await amu.get('https://jsonplaceholder.typicode.com/users/1')
```

### Query string with the configurable serializer
```ts
const api = createClient({
  baseURL: 'https://api.example.com',
  querySerializer: 'qs',                   // 'flat' (default) | 'qs' | (q) => string
})
await api.get('/users', { query: { filter: { status: 'active' } } })
// → /users?filter[status]=active
```

### Retries (idempotent-only by default; opt in for POST)
```ts
await api.get('/stats', {
  retries: { attempts: 3, delay: (n) => 2 ** n * 100, retryOn: ['network-error', 503] },
})
await api.post('/jobs', payload, {
  retries: { attempts: 2, allowNonIdempotent: true },
})
```

### Timeouts
```ts
const api = createClient({ timeout: 8_000 })       // global default
await api.get('/slow', { timeout: 30_000 })        // per-request override
```

### Schema inference works with multiple validators
```ts
import { z } from 'zod'
import * as v from 'valibot'
import { type } from 'arktype'

await api.get('/u/1', { schema: { response: z.object({ id: z.number() }) } })
await api.get('/u/1', { schema: { response: v.object({ id: v.number() }) } })
await api.get('/u/1', { schema: { response: type({ id: 'number' }) } })
// All three return the inferred output type.
```

### Response body without the wrapper *is* the default — but you can opt into raw
amu's methods return parsed data directly. If you need the raw `Response` (status, headers, etc.), use `client.stream()` or read the `Response` directly via a custom middleware. There is no `raw: true` flag in v2 — it's now an explicit choice.

---

## Streaming

### Raw stream
```ts
const stream = await api.stream('/file.bin')      // ReadableStream<Uint8Array>
```

### Server-Sent Events
```ts
import { parseSSE } from 'amu-http'

for await (const event of parseSSE(await api.stream('/chat'))) {
  console.log(event.data)
}
```

### NDJSON with per-line schema validation
```ts
import { parseNDJSON } from 'amu-http'

const Item = z.object({ id: z.number(), text: z.string() })

for await (const item of parseNDJSON(await api.stream('/feed'), {
  schema: Item,
  onError: 'yield',                              // 'throw' | 'skip' | 'yield'
})) {
  if (item instanceof Error) handleBad(item)
  else handle(item)                              // ^? { id: number; text: string }
}
```

### Streamed upload
```ts
const fileStream = openReadStream('big.zip')
await api.post('/upload', fileStream, {
  headers: { 'content-type': 'application/octet-stream' },
})
```

---

## Middleware

amu's only abstraction. Built-in features (retry, timeout, validate, parse) *are* middleware. User middleware composes through the same chain.

```ts
import { createClient, defineMiddleware } from 'amu-http'
import { bearerAuth, refreshOn401 } from 'amu-http/middleware/auth'
import { requestId } from 'amu-http/middleware/requestId'
import { logger } from 'amu-http/middleware/logger'

const trace = defineMiddleware('trace', async (ctx, next) => {
  const start = performance.now()
  const res = await next(ctx)
  console.log(`${ctx.method} ${ctx.url} ${res.response.status} ${(performance.now() - start).toFixed(0)}ms`)
  return res
})

const api = createClient({
  baseURL: 'https://api.example.com',
  middleware: [
    logger(),                                     // outer-most
    requestId(),
    refreshOn401({ refresh: () => store.refresh() }),
    bearerAuth(() => store.token),
    trace,
  ],
})
```

### Recommended order (outer → inner)

`logger` / telemetry → `requestId` → `refreshOn401` → `bearerAuth` → custom

User middleware sits *outside* built-ins, so:
- `logger` sees the full request lifecycle including retries
- `refreshOn401` catches `AmuError` thrown by `parse` on 401
- `bearerAuth` injects the latest token on each retry attempt

### Built-in middleware (per-file imports — tree-shakable)

| Module | Exports |
|---|---|
| `amu-http/middleware/auth` | `bearerAuth`, `basicAuth`, `refreshOn401` |
| `amu-http/middleware/requestId` | `requestId` |
| `amu-http/middleware/logger` | `logger` |

#### Refresh-on-401 with concurrent dedupe
```ts
import { bearerAuth, refreshOn401 } from 'amu-http/middleware/auth'

const api = createClient({
  middleware: [
    refreshOn401({ refresh: () => authStore.rotate() }),
    bearerAuth(() => authStore.token),
  ],
})

// 50 concurrent requests that all hit 401 → 1 refresh, 50 retries.
```

---

## Sub-clients via `client.extend()`

```ts
const api = createClient({ baseURL: 'https://api.example.com' })

const v2 = api.extend({ baseURL: 'https://api.example.com/v2' })
const authed = api.extend({ middleware: [bearerAuth(token)] })
```

Headers merge, middleware appends (extension sits inside parent in the onion), other config overrides.

---

## Forms

```ts
import { formData, urlEncoded } from 'amu-http/forms'

await api.post('/upload', formData({ file: blob, name: 'Ada' }))
await api.post('/login', urlEncoded({ user: 'a', pass: 'b' }))
```

The body serializer also accepts native `FormData`, `URLSearchParams`, `Blob`, `ReadableStream`, `ArrayBuffer`, and strings — the helpers are just typed sugar.

---

## Testing

```ts
import { createMockClient } from 'amu-http/test'

const mock = createMockClient({ baseURL: 'https://api.example.com' })

mock.on('GET', '/users/:id', ({ params }) => ({
  body: { id: Number(params.id), name: 'Ada' },
}))
mock.reply('POST', '/users', 201, { id: 99 })
mock.on('GET', '/slow', () => ({ delay: 100, body: { ok: true } }))

// Use the typed Client — schema validation, middleware, retries all work.
const user = await mock.client.get('/users/:id', { params: { id: 1 } })

mock.assertCalled('GET', '/users/:id', 1)
mock.calls()        // RecordedRequest[]
mock.reset()
```

Replaces the brittle `vi.stubGlobal('fetch', ...)` pattern. No external deps.

---

## Errors — full taxonomy

| Class | Thrown when | Key fields |
|---|---|---|
| `AmuError` | HTTP non-2xx response | `status`, `statusText`, `data`, `headers` |
| `AmuNetworkError` | Transport failure | `kind` (one of 8), `isRetryable`, `cause` |
| `AmuUrlError` | URL malformed before request | `input`, `suggestion` |
| `AmuValidationError` | Schema mismatch (request OR response body) | `target`, `data`, `issues` |
| `AmuUnknownError` | Non-amu error thrown inside middleware (programming bug) | `cause` |

`AmuNetworkError.kind` values:
- `dns` — DNS resolution failed
- `connect` — TCP connect failed
- `tls` — TLS handshake failed (non-retryable)
- `timeout-idle` — socket idle timeout from undici
- `timeout-active` — your `timeout` middleware fired
- `abort` — user-triggered `AbortSignal` (non-retryable)
- `reset` — connection reset / `EPIPE`
- `unknown`

URL safety: amu rejects malformed absolute URLs *before* any network activity. `https:google.com` throws `AmuUrlError` with `suggestion: 'https://google.com'`.

---

## Bundle size — what you actually pay

Tree-shakable per import set:

| What you import | Gzip |
|---|---|
| `{ createClient }` | 3.45 KB |
| `{ createClient, AmuError, AmuNetworkError, ... }` (full error union) | 3.46 KB |
| `{ createClient, parseSSE }` | 3.84 KB |
| `{ createClient, parseSSE, parseNDJSON }` | 4.12 KB |
| Full barrel | 4.13 KB |
| `amu-http/middleware/auth` (chunk) | 0.47 KB |
| `amu-http/middleware/requestId` (chunk) | 0.31 KB |
| `amu-http/middleware/logger` (chunk) | 0.54 KB |
| `amu-http/forms` (chunk) | ~0.4 KB |
| `amu-http/test` (chunk) | ~1 KB |

---

## Runtime compatibility

| Runtime | Supported |
|---|---|
| Node | ≥ 20.3 |
| Browsers | All modern (Chrome ≥ 90, Firefox ≥ 88, Safari ≥ 14) |
| Cloudflare Workers / Vercel Edge / Deno / Bun | ✅ |
| TypeScript | ≥ 5.5 |
| Validators (optional) | Zod 3.24+, Valibot 0.31+, ArkType 2+, or any [Standard Schema](https://standardschema.dev) implementer |

ESM-only. The package has zero runtime dependencies.

---

## Migration from v1

v2 is a ground-up rewrite. The old class-based `Amu` API, the `(url, body, config)` argument shapes, the `raw: true` option, and CJS support are all gone. Codebases on v1 should pin to `1.x` and migrate when convenient — there is no automated codemod.

Headline differences:
- `new Amu(...)` → `createClient(...)`
- Per-request `<T>` annotation → `schema: { response: T }` (and the type is *inferred*, not declared)
- `params` (query) → split into `params` (URL `:id` substitutions) and `query` (`?key=value`)
- v1 had one error class hierarchy with thinner discrimination — v2 has 5 with exhaustive `kind` taxonomy
- `safe()` Result API is new
- Streaming (`stream` / `parseSSE` / `parseNDJSON`) is new
- `createMockClient` is new

---

## Development

```bash
npm ci                 # installs deps and registers pre-commit hook
npm run lint           # biome
npm run typecheck      # tsc --noEmit
npm test               # vitest — unit + browser + type tests
npm run bench          # microbenchmarks
npm run build          # tsdown → dist/
npm run verify         # publint + attw
npm run size           # size-limit (per-import-set budgets)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. Security disclosures: [SECURITY.md](SECURITY.md).

---

## License

MIT
