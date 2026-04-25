# Amu

**Amu** is **Fetch done right (without the pain)** for modern JavaScript and TypeScript apps.
It keeps native Fetch performance, but removes the repetitive parts that slow teams down.

Named after **Amayra**, this library is designed to be as clean, fast, and reliable as possible.

## 📦 Installation

```bash
npm install amu-http
```

## ⚡ Aha Moment

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

## ✨ Fetch Done Right

Modern teams often avoid raw Fetch because of repeated pain points:

* **Manual parsing everywhere**: `await res.json()` in every call site.
* **Inconsistent error handling**: every project invents a different pattern.
* **Retries missing by default**: flaky networks become app-level bugs.
* **Timeout boilerplate**: repeated `AbortController` wiring in business code.

Amu keeps native Fetch, but solves those pains out of the box:

* **Auto JSON/Text parsing** with direct data return (`await amu.get()`).
* **Consistent request flow** with built-in retries and timeout handling.
* **Axios-style ergonomics** (`post(url, data, config)`) on top of Fetch.
* **Schema validation support** for safer API integrations.
* **Tiny package footprint** for web and server runtimes.

## Why Choose Amu Over Axios (for modern runtimes)

If you are on browser standards and Node 18+, Amu gives a cleaner Fetch-first model:

* **Fetch-native behavior** instead of adapter-heavy abstraction.
* **Less wrapper ceremony** while keeping familiar client ergonomics.
* **Smaller dependency cost** with focused features for modern apps.

When Axios may still be better:

* **Legacy runtime support**: If you need older environments that do not have stable Fetch.
* **Large interceptor-heavy codebases**: Axios has a mature ecosystem around advanced interceptor workflows.

## 🧠 Design Principles

- **Minimal abstraction over Fetch**
- **Predictable behavior over magic**
- **Direct data access over wrapper objects**
- **Small surface area over feature bloat**

## 📏 Build Size

Current package output (minified, from `dist/`):

- **ESM** (`dist/index.js`): `3693 B` (~`3.6 KB`)
- **CJS** (`dist/index.cjs`): `4225 B` (~`4.1 KB`)
- **ESM gzip**: `1597 B` (~`1.6 KB`)
- **CJS gzip**: `1833 B` (~`1.8 KB`)

Measure locally:

```bash
npm run build
ls -l dist
gzip -c dist/index.js | wc -c
gzip -c dist/index.cjs | wc -c
```

---

## 🚀 Usage Examples

### 1) Basic GET

```ts
import amu from 'amu-http';

const users = await amu.get('https://jsonplaceholder.typicode.com/users');
console.log(users.length);
```

### 2) POST JSON Body (Axios-style)

```ts
import amu from 'amu-http';

const created = await amu.post('https://jsonplaceholder.typicode.com/posts', {
  title: 'hello',
  body: 'from amu',
  userId: 1,
});
```

### 3) PUT, PATCH, DELETE

```ts
import amu from 'amu-http';

await amu.put('https://api.example.com/users/1', { name: 'Updated Name' });
await amu.patch('https://api.example.com/users/1', { role: 'admin' });
await amu.delete('https://api.example.com/users/1');
```

### 3.1) Query Params

```ts
import amu from 'amu-http';

const users = await amu.get('https://api.example.com/users', {
  params: { page: 1, limit: 10 },
});
```

You can also pass query params directly in the URL:

```ts
const users = await amu.get('https://api.example.com/users?page=1&limit=10');
```

Mixing URL query + `params` also works:

```ts
await amu.get('https://api.example.com/users?page=1', {
  params: { limit: 10 },
});
// Final URL: /users?page=1&limit=10
```

### 4) Bearer Token / Custom Headers

```ts
import amu from 'amu-http';

const token = process.env.API_TOKEN;

const profile = await amu.get('https://api.example.com/me', {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

### 4.1) Bearer Token with Data (Authenticated POST)

```ts
import amu from 'amu-http';

const token = process.env.API_TOKEN;

const order = await amu.post(
  'https://api.example.com/orders',
  {
    productId: 'sku_123',
    quantity: 2,
  },
  {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }
);
```

### 5) Timeout and Retries

```ts
import amu from 'amu-http';

const data = await amu.get('https://api.example.com/stats', {
  timeout: 5000,
  retries: 2,
});
```

Safe default retries (network failures only):

```ts
const data = await amu.get('https://api.example.com/stats', {
  retries: 2, // retries only network errors (not timeouts, not HTTP status errors)
});
```

Advanced retry policy:

```ts
const data = await amu.get('https://api.example.com/stats', {
  retries: {
    attempts: 3,
    delay: (attempt) => 2 ** attempt * 100, // 200ms, 400ms, 800ms
    retryOn: ['network-error', 429, 500, 502, 503, 504],
  },
});
```

Retry behavior:
- Retries network failures only when `'network-error'` is in `retryOn` (enabled by default).
- Does not retry timeout aborts (`AbortController`) by default.
- Does not retry HTTP errors unless those status codes are explicitly included in `retryOn`.
- Retries are applied only to idempotent methods (`GET`, `HEAD`) by default.
- Non-idempotent methods (`POST`, `PATCH`, `DELETE`, etc.) are not retried unless `allowNonIdempotent: true` is set.
- Supports fixed or computed delay per attempt.

### 5.1) Error Handling (Non-2xx)

```ts
import amu, { AmuError } from 'amu-http';

try {
  await amu.get('https://api.example.com/404');
} catch (err) {
  if (err instanceof AmuError) {
    console.log(err.status);  // 404
    console.log(err.data);    // parsed response body
    console.log(err.headers); // response headers
  }
}
```

Amu throws `AmuError` for non-2xx responses:

```ts
class AmuError extends Error {
  status: number;
  data: unknown;
  headers: Headers;
}
```

### 6) Create a Custom Instance (Factory)

```ts
import amu from 'amu-http';

const api = amu('https://api.example.com', {
  headers: { 'X-App': 'dashboard' },
  timeout: 8000,
  retries: 1,
});

const me = await api.get('/me');
```

### 7) Explicit Response Readers

```ts
import amu from 'amu-http';

const req = amu.get('https://api.example.com/raw');
const asJson = await req.json();

const req2 = amu.get('https://api.example.com/message');
const asText = await req2.text();
```

The request is executed once. Response readers reuse the same underlying response.

### 8) Schema Validation (Zod or Custom)

```ts
import amu, { AmuValidationError } from 'amu-http';
import { z } from 'zod';

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
});

try {
  const user = await amu.get('https://api.example.com/user/1', {
    schema: UserSchema, // uses schema.parse(data)
  });
  console.log(user.name);
} catch (error) {
  if (error instanceof AmuValidationError) {
    console.error('Invalid API response shape:', error.issues);
  }
}
```

Custom validator function:

```ts
const users = await amu.get('https://api.example.com/users', {
  schema: (input) => {
    if (!Array.isArray(input)) throw new Error('Expected array');
    return input as Array<{ id: number; name: string }>;
  },
});
```

## API Surface

```ts
amu.get<T>(url, config?)
amu.post<T>(url, data?, config?)
amu.put<T>(url, data?, config?)
amu.patch<T>(url, data?, config?)
amu.delete<T>(url, config?)
amu.request<T>(url, config?)
```

`config` supports:
- `headers`
- `timeout` (ms)
- `retries` (`number` or `{ attempts, delay, retryOn, allowNonIdempotent }`, where `retryOn` supports status codes and `'network-error'`)
- `params` (query params)
- `json` (request body)
- `schema` (response validator: function or object with `parse`)
- standard `fetch` `RequestInit` fields

## Development

```bash
npm run lint
npm run build
npm run dev
```