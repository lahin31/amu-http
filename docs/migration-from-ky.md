# Migrating from ky to amu

ky is the closest neighbor to amu — both are typed fetch wrappers that throw on non-2xx. amu adds **schema inference**, **type-safe URL params**, and a **discriminated error union** that ky doesn't have. amu is also slightly smaller.

If you're happy with ky, you don't *need* to switch. This guide is for teams who want the additional type safety.

---

## At a glance

| Concept | ky | amu |
|---|---|---|
| Create instance | `ky.create({ prefix })` | `createClient({ baseURL })` |
| Default singleton | `ky` | `amu` |
| `prefix` (1.x: `prefixUrl`) | yes | `baseURL` |
| Throw on non-2xx | yes (`HTTPError`) | yes (`AmuError`) |
| Hooks | `hooks: { beforeRequest, afterResponse, beforeRetry, beforeError }` | `middleware: [...]` |
| Retry | `retry` config | `retries` config |
| Schema validation | external | first-class `schema:` |
| URL params (`:id`) | string interpolation | type-safe `params:` |
| `Result<T>` | none (throws) | `client.safe.*` |

---

## Side-by-side

### Basic GET / POST

```ts
// ky
const data = await ky.get('https://x/users/1').json()
const created = await ky.post('https://x/users', { json: { name: 'Ada' } }).json()

// amu
const data = await api.get('https://x/users/1')
const created = await api.post('https://x/users', { name: 'Ada' })
```

amu doesn't require `.json()` chaining — JSON is the default response shape.

### Base URL + retry + timeout

```ts
// ky
const client = ky.create({
  prefix: 'https://api.example.com',
  timeout: 5000,
  retry: { limit: 3, backoffLimit: 2000 },
})

// amu
const api = createClient({
  baseURL: 'https://api.example.com',
  timeout: 5000,
  retries: { attempts: 3, delay: (n) => 2 ** n * 100 },
})
```

### URL params

```ts
// ky — manual interpolation
await ky.get(`users/${id}/posts/${postId}`)

// amu — compile-checked
await api.get('/users/:id/posts/:postId', { params: { id, postId } })
```

### Hooks → middleware

```ts
// ky
ky.create({
  hooks: {
    beforeRequest: [(req) => req.headers.set('Authorization', `Bearer ${token}`)],
    beforeRetry: [({ error, retryCount }) => log('retry', retryCount, error)],
    afterResponse: [(req, opts, res) => { /* ... */ return res }],
    beforeError: [(err) => err],
  },
})

// amu — single middleware abstraction; built-in middleware for common cases
import { bearerAuth } from 'amu-http/middleware/auth'
import { logger } from 'amu-http/middleware/logger'

const api = createClient({
  middleware: [
    bearerAuth(() => token),
    logger(),
  ],
  retries: {
    attempts: 3,
    onAttempt: ({ attempt, error }) => log('retry', attempt, error),
  },
})
```

### Custom middleware

```ts
// ky — split across hook phases
ky.create({
  hooks: {
    beforeRequest: [(req) => { req.headers.set('x-trace', uuid()) }],
    afterResponse: [(req, opts, res) => { log(req.url, res.status) }],
  },
})

// amu — single onion-style function for full request lifecycle
import { defineMiddleware } from 'amu-http'

const trace = defineMiddleware('trace', async (ctx, next) => {
  const headers = new Headers(ctx.headers)
  headers.set('x-trace', crypto.randomUUID())
  const start = performance.now()
  const res = await next({ ...ctx, headers })
  log(ctx.url, res.response.status, performance.now() - start)
  return res
})
```

### Errors

```ts
// ky
import { HTTPError, TimeoutError } from 'ky'

try {
  await ky.get('/x')
} catch (err) {
  if (err instanceof HTTPError) {
    console.log(err.response.status)
  } else if (err instanceof TimeoutError) {
    console.log('timed out')
  }
}

// amu — 5 discriminated classes, AmuNetworkError has 8 .kind values
try {
  await api.get('/x')
} catch (err) {
  if (err instanceof AmuError) console.log(err.status, err.data)
  else if (err instanceof AmuNetworkError) {
    switch (err.kind) {
      case 'timeout-active': // our timeout fired
      case 'timeout-idle':   // server hung
      case 'dns':
      case 'connect':
      case 'tls':
      case 'reset':
      case 'abort':
      case 'unknown':
    }
  }
}
```

### Schema validation

```ts
// ky — manual
const Schema = z.object({ id: z.number() })
const data = await ky.get('/u/1').json()
const validated = Schema.parse(data)

// amu — types follow the schema; runtime + compile-time tied
const validated = await api.get('/u/1', { schema: { response: Schema } })
//    ^? z.infer<typeof Schema>
```

amu validates request bodies the same way: `schema: { body: CreateUser, response: User }`.

### `extend()`

```ts
// ky
const v2 = parent.extend({ prefix: 'https://api.example.com/v2' })

// amu — same name
const v2 = parent.extend({ baseURL: 'https://api.example.com/v2' })
```

### `Result<T>` — opt-in non-throwing API

```ts
// ky — only throws
try {
  const data = await ky.get('/u').json()
} catch (err) { /* ... */ }

// amu — pick your style
const r = await api.safe.get('/u')
if (r.ok) {
  // r.data is typed
} else {
  // r.error is the 5-class union; exhaustive switch checked by TS
}
```

---

## Differences worth knowing

- amu is ESM-only. ky is too as of 2.x.
- amu requires Node ≥ 20.3 (native `AbortSignal.any`). ky targets Node ≥ 18.
- amu's middleware is one onion-style function; ky's is four hook phases. The onion model is more flexible but less granular.
- ky is more battle-tested. amu is newer.

---

## Reverse: when ky might still fit better

- You don't need schema inference and want minimum cognitive load.
- You want the Sindre Sorhus track record.
- You're already happy and don't want to migrate.
