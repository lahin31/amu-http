# Migrating from Axios to amu

Axios is the most common JavaScript HTTP client. This guide maps every Axios feature you're likely using to its amu equivalent.

amu is **~10x smaller** (3.5 KB vs 14 KB gzip), **schema-aware**, and exposes **discriminated error classes** Axios doesn't have. Things you give up: upload progress (fetch limit) and the deep plugin ecosystem.

---

## At a glance

| Concept | Axios | amu |
|---|---|---|
| Create instance | `axios.create({ baseURL })` | `createClient({ baseURL })` |
| Default singleton | `axios` | `amu` |
| Response wrapper | `res.data` | direct return |
| Throw on non-2xx | yes | yes (`AmuError`) |
| Generic response type | `axios.get<T>(url)` | `api.get<T>(url)` (or via `schema:`) |
| Interceptors | `axios.interceptors.{request,response}` | `middleware: [...]` |
| Cancel | `AbortController` (modern) | `AbortController` |
| Request retries | `axios-retry` external | built-in `retries` |
| Schema validation | manual or `axios-zod` | first-class `schema:` |

---

## Side-by-side

### Basic GET / POST

```ts
// Axios
import axios from 'axios'
const { data } = await axios.get('/users/1')
const { data: created } = await axios.post('/users', { name: 'Ada' })

// amu
import { createClient } from 'amu-http'
const api = createClient()
const data = await api.get('/users/1')                // no .data wrapper
const created = await api.post('/users', { name: 'Ada' })
```

### Base URL + headers

```ts
// Axios
const client = axios.create({
  baseURL: 'https://api.example.com',
  headers: { 'X-App': 'demo' },
  timeout: 5000,
})

// amu — identical
const api = createClient({
  baseURL: 'https://api.example.com',
  headers: { 'X-App': 'demo' },
  timeout: 5000,
})
```

### URL params (`/users/:id`)

```ts
// Axios — manual interpolation, easy to forget escaping
const { data } = await axios.get(`/users/${id}/posts/${postId}`)

// amu — type-safe at compile time
const data = await api.get('/users/:id/posts/:postId', {
  params: { id, postId },
})
```

amu errors at compile time if you forget a key. Axios doesn't.

### Query string

```ts
// Axios
await axios.get('/users', { params: { page: 1, limit: 10 } })

// amu — `params` is for URL substitution; query goes in `query`
await api.get('/users', { query: { page: 1, limit: 10 } })
```

### Interceptors → middleware

```ts
// Axios
axios.interceptors.request.use((config) => {
  config.headers.set('Authorization', `Bearer ${getToken()}`)
  return config
})
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) return refreshAndRetry(error)
    throw error
  },
)

// amu — built-in middleware (per-file imports, tree-shakable)
import { bearerAuth, refreshOn401 } from 'amu-http/middleware/auth'

const api = createClient({
  middleware: [
    refreshOn401({ refresh: () => store.refresh() }),
    bearerAuth(() => store.token),
  ],
})
```

`refreshOn401` deduplicates concurrent refresh calls — 50 in-flight 401s trigger one refresh.

### Custom middleware

```ts
// Axios
axios.interceptors.request.use((config) => {
  console.log(`→ ${config.method?.toUpperCase()} ${config.url}`)
  return config
})

// amu — middleware is a single onion-style function
import { defineMiddleware } from 'amu-http'

const trace = defineMiddleware('trace', async (ctx, next) => {
  console.log(`→ ${ctx.method} ${ctx.url}`)
  const res = await next(ctx)
  console.log(`← ${ctx.method} ${ctx.url} ${res.response.status}`)
  return res
})

createClient({ middleware: [trace] })
```

### Errors

```ts
// Axios
try {
  await axios.get('/x')
} catch (err) {
  if (axios.isAxiosError(err)) {
    if (err.response) {                   // got a response — HTTP error
      console.log(err.response.status, err.response.data)
    } else if (err.request) {             // no response — network error
      console.log('Network error:', err.message)
    } else {
      console.log('Setup error:', err.message)
    }
  }
}

// amu — discriminated classes, exhaustive narrowing
import { AmuError, AmuNetworkError } from 'amu-http'

try {
  await api.get('/x')
} catch (err) {
  if (err instanceof AmuError) {
    console.log(err.status, err.data)     // HTTP error
  } else if (err instanceof AmuNetworkError) {
    console.log('Transport:', err.kind)   // 'dns' | 'connect' | 'tls' | ...
  }
}

// Or use the safe() Result API — 5-class union with exhaustive switch
const r = await api.safe.get('/x')
if (!r.ok) {
  switch (r.error.name) {
    case 'AmuError':            // narrow .status, .data
    case 'AmuNetworkError':     // narrow .kind (8 values)
    case 'AmuUrlError':         // narrow .input, .suggestion
    case 'AmuValidationError':  // narrow .target, .issues
    case 'AmuUnknownError':     // catch-all
  }
}
```

### Retries

```ts
// Axios — needs `axios-retry` package
import axiosRetry from 'axios-retry'
axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay })

// amu — built-in
await api.get('/x', {
  retries: { attempts: 3, delay: (n) => 2 ** n * 100, retryOn: ['network-error', 503] },
})
```

### Schema validation

```ts
// Axios — manual
import { z } from 'zod'
const User = z.object({ id: z.number(), name: z.string() })
const { data } = await axios.get('/users/1')
const validated = User.parse(data)

// amu — first-class, types follow the schema
const user = await api.get('/users/1', { schema: { response: User } })
//    ^? z.infer<typeof User>
```

amu also validates request bodies before sending (`schema.body`).

### File upload

```ts
// Axios — supports XHR upload progress
const form = new FormData()
form.append('file', blob)
await axios.post('/upload', form, {
  onUploadProgress: (e) => console.log(e.loaded / e.total),
})

// amu — fetch can't natively report upload progress; the FormData itself works
import { formData } from 'amu-http/forms'
await api.post('/upload', formData({ file: blob }))
```

If upload progress is critical: keep using Axios for that endpoint, or wait for fetch's `Request.duplex: 'half'` patterns to mature.

### Cancel a request

```ts
// Axios (modern style — old "cancel tokens" are deprecated)
const ctrl = new AbortController()
axios.get('/x', { signal: ctrl.signal })
ctrl.abort()

// amu — same
const ctrl = new AbortController()
api.get('/x', { signal: ctrl.signal })
ctrl.abort()
```

### Mocking in tests

```ts
// Axios — needs axios-mock-adapter
import MockAdapter from 'axios-mock-adapter'
const mock = new MockAdapter(axios)
mock.onGet('/users/1').reply(200, { id: 1 })

// amu — first-party, type-safe URL templates
import { createMockClient } from 'amu-http/test'
const mock = createMockClient()
mock.on('GET', '/users/:id', ({ params }) => ({ body: { id: Number(params.id) } }))
```

---

## Things you give up

- **Upload progress.** fetch can't report it. axios uses XHR specifically for this. If you need it for a few endpoints, keep them on axios.
- **CommonJS support.** amu is ESM-only.
- **Plugin ecosystem.** `axios-cache-interceptor`, `axios-rate-limit`, etc. amu has built-in cache and you can write equivalents as middleware in 30 lines.
- **Browser-specific XSRF helper.** Pattern via middleware in 10 lines if needed.

## Things you gain

- **3-4× smaller bundle.**
- **Schema-inferred response and request body types** — no other client does this.
- **Type-safe `:id` URL params.**
- **Discriminated error union.**
- **`safe()` Result API.**
- **Streaming first-class** (SSE, NDJSON).
- **First-party mock client.**
- **Universal** (Node, browsers, edge, Deno, Bun) on a single bundle.
