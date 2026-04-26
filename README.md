# Amu

**Amu** is a **Fetch-first HTTP client with correct defaults** for modern JavaScript and TypeScript apps.

It keeps native Fetch behavior while removing the boilerplate that slows teams down in real-world systems.

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
- Smart retries (HTTP-aware)
- Structured errors
- URL safety (rejects malformed absolute URLs)
- Schema validation support
- Tiny footprint (~1.6KB gzip)

Amu is not a wrapper over Fetch.  
It is a **correct-by-default HTTP client**.

---

## ⚖️ Amu vs Axios

| Feature              | Amu                     | Axios                |
|---------------------|--------------------------|----------------------|
| Data access         | Direct (`await get()`)   | `res.data`           |
| Fetch-native        | ✅                        | ❌ (adapters)        |
| Retry semantics     | HTTP-aware               | Manual               |
| Error structure     | Typed & structured       | Inconsistent         |
| URL validation      | Strict                   | Lenient              |
| Bundle size         | ~1.6KB (gzip)            | ~14KB (gzip)         |

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

Amu rejects malformed absolute URLs.

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
```