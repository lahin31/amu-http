# Amu

**Amu** is **Fetch done right (without the pain)** for modern JavaScript and TypeScript apps.
It keeps native Fetch performance, but removes the repetitive parts that slow teams down.

Named after **Amayra**, this library is designed to be as clean, fast, and reliable as possible.

## 📦 Installation

```bash
npm install amu-http
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
- `retries`
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