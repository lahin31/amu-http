# Migrating from ofetch to amu

ofetch is the Nuxt-blessed fetch wrapper. It's slightly larger than amu but has good auto-detection of response shapes and strong SSR ergonomics. Migration is mostly straightforward.

amu's wins: schema inference, type-safe URL params, discriminated errors, smaller bundle. ofetch's wins: SSR/Nuxt integration, `$fetch` shorthand, auto-format detection.

---

## At a glance

| Concept | ofetch | amu |
|---|---|---|
| Default singleton | `$fetch` / `ofetch` | `amu` |
| Create instance | `ofetch.create({ baseURL })` | `createClient({ baseURL })` |
| Throw on non-2xx | yes (`FetchError`) | yes (`AmuError`) |
| Interceptors | `onRequest`, `onResponse`, `onRequestError`, `onResponseError` | `middleware: [...]` |
| Retry | `retry`, `retryDelay` | `retries` config |
| Schema validation | external | first-class `schema:` |

---

## Side-by-side

### Basic GET / POST

```ts
// ofetch
import { ofetch } from 'ofetch'
const data = await ofetch('/users/1', { baseURL: 'https://x' })
const created = await ofetch('/users', {
  baseURL: 'https://x',
  method: 'POST',
  body: { name: 'Ada' },
})

// amu
const api = createClient({ baseURL: 'https://x' })
const data = await api.get('/users/1')
const created = await api.post('/users', { name: 'Ada' })
```

amu uses dedicated method functions instead of method-as-option.

### Base URL + retry + timeout

```ts
// ofetch
const client = ofetch.create({
  baseURL: 'https://api.example.com',
  timeout: 5000,
  retry: 2,
  retryDelay: 500,
})

// amu
const api = createClient({
  baseURL: 'https://api.example.com',
  timeout: 5000,
  retries: { attempts: 2, delay: 500 },
})
```

### URL params

```ts
// ofetch — string interpolation
await ofetch(`/users/${id}/posts/${postId}`)

// amu — compile-checked
await api.get('/users/:id/posts/:postId', { params: { id, postId } })
```

### Query string

```ts
// ofetch — `query` or `params` (alias)
await ofetch('/users', { query: { page: 1 } })

// amu — `query` for the URL query string, `params` for path :name substitutions
await api.get('/users', { query: { page: 1 } })
```

### Interceptors → middleware

```ts
// ofetch
ofetch.create({
  onRequest({ request, options }) {
    options.headers = new Headers(options.headers)
    options.headers.set('Authorization', `Bearer ${token}`)
  },
  onResponseError({ response }) {
    if (response.status === 401) /* refresh */
  },
})

// amu — single middleware abstraction
import { bearerAuth, refreshOn401 } from 'amu-http/middleware/auth'

const api = createClient({
  middleware: [
    refreshOn401({ refresh: () => store.refresh() }),
    bearerAuth(() => store.token),
  ],
})
```

### Custom middleware

```ts
// ofetch
ofetch.create({
  onRequest({ request }) { console.log(`→ ${request}`) },
  onResponse({ request, response }) { console.log(`← ${request} ${response.status}`) },
})

// amu — full lifecycle in one function
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
// ofetch
import { FetchError } from 'ofetch'
try {
  await ofetch('/x')
} catch (err) {
  if (err instanceof FetchError) {
    console.log(err.status, err.data, err.statusText)
  }
}

// amu — five classes, AmuNetworkError has 8 discriminator values
try {
  await api.get('/x')
} catch (err) {
  if (err instanceof AmuError) {
    console.log(err.status, err.data, err.statusText)   // HTTP error
  } else if (err instanceof AmuNetworkError) {
    console.log(err.kind)                                // 'dns' | 'connect' | ...
  }
}
```

### Schema validation

```ts
// ofetch — manual
const data = await ofetch('/u/1')
const validated = User.parse(data)

// amu — types follow the schema
const user = await api.get('/u/1', { schema: { response: User } })
//    ^? z.infer<typeof User>
```

### `$fetch` global vs amu singleton

```ts
// ofetch — globally available in Nuxt
const data = await $fetch('/api/users')

// amu — same shape via the default singleton
import { amu } from 'amu-http'
const data = await amu.get('https://x/api/users')
```

For Nuxt apps specifically, ofetch's SSR-aware behaviour is hard to replicate. If you're inside Nuxt and want SSR-savvy fetching, stick with `$fetch`. amu shines when you want max type safety on a portable client.

---

## Differences worth knowing

- amu doesn't auto-detect response type beyond JSON / text / blob (matches ofetch's behaviour for the common cases).
- amu requires Node ≥ 20.3. ofetch targets ≥ 18.
- amu has built-in caching, OTel, cookies, requestId middleware. ofetch leaves those to userland.
- ofetch's middleware is split across four hook phases; amu uses one onion middleware. ofetch is more granular; amu more flexible.

---

## Reverse: when ofetch might still fit better

- You're inside Nuxt and want first-class SSR fetch behaviour.
- You like `$fetch`'s zero-config one-liner ergonomics.
- You don't need schema inference.
