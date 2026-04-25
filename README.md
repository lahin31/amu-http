# Amu

**Amu** is a graceful, ultra-lightweight HTTP client for modern JavaScript and TypeScript. Built on the native Fetch API, it provides the developer experience of Axios with the performance and size of a minimalist wrapper.

Named after **Amayra**, this library is designed to be as clean, fast, and reliable as possible.

## 📦 Installation

```bash
npm install amu-http
```

## ✨ Why Amu?

* **Zero-Boilerplate**: Automatically parses JSON responses. No more `(await res).json()`.
* **Direct Access**: `await amu.get()` returns your data directly, not a wrapper object.
* **Axios-Style API**: Use the familiar `post(url, data, config)` signature.
* **Hybrid Factory**: Use the default instance or create custom ones by calling `amu()`.
* **Auto-Retries**: Built-in logic to handle flaky network connections.
* **Tiniest Bundle**: ~1.5KB—roughly 20x smaller than Axios.

## Why It Can Be Better Than Axios

If your app already runs on modern runtimes (browser, Node 18+), Amu can be a better fit than Axios for many use cases:

* **Smaller bundle footprint**: Amu is dramatically lighter, which helps web performance and cold starts.
* **Native Fetch under the hood**: No custom adapter layer, so behavior stays close to platform standards.
* **Cleaner response handling**: `await amu.get()` gives parsed data directly instead of `response.data`.
* **Simple API surface**: Common HTTP methods, retries, timeout, JSON body, and headers without extra setup.
* **Factory + instance pattern**: Use one default client or create isolated clients for multiple APIs.

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
- standard `fetch` `RequestInit` fields

## Development

```bash
npm run lint
npm run build
npm run dev
```