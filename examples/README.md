# amu-http examples

Runnable TypeScript files demonstrating each major v2 feature.

```bash
# from the repo root
npm ci
npm run build              # first time only — examples import from `dist/` via package self-reference
npx tsx examples/01-basic-get.ts
```

Examples import from `'amu-http'` (the published package name). Node's package self-reference resolves it through this repo's `package.json` `exports` map, which points at `dist/`. The first run requires a build; subsequent runs reuse it.

If you prefer to skip the build, edit each import to use `../src/index` instead (the source resolves identically).

## Index

| # | File | What it shows |
|---|---|---|
| 01 | [01-basic-get.ts](01-basic-get.ts) | Default singleton `amu` for one-line absolute-URL calls |
| 02 | [02-schema-inference.ts](02-schema-inference.ts) | **Schema-inferred response types** (the v2 wedge) |
| 03 | [03-typed-url-params.ts](03-typed-url-params.ts) | **Type-safe `:name` URL params** — compile error if a key is missing |
| 04 | [04-validated-body.ts](04-validated-body.ts) | **Schema-validated request bodies** — caught locally before send |
| 05 | [05-discriminated-errors.ts](05-discriminated-errors.ts) | **`client.safe.*` + 5-class `Result` union** — exhaustive `switch` |
| 06 | [06-retries.ts](06-retries.ts) | Safe defaults + advanced retry policy with backoff |
| 07 | [07-middleware-auth.ts](07-middleware-auth.ts) | `bearerAuth` + `refreshOn401` + `requestId` + `logger` |
| 08 | [08-streaming-sse.ts](08-streaming-sse.ts) | `client.stream()` + `parseSSE` for Server-Sent Events |
| 09 | [09-streaming-ndjson.ts](09-streaming-ndjson.ts) | NDJSON with per-line schema validation, `onError: 'yield'` |
| 10 | [10-mock-client-testing.ts](10-mock-client-testing.ts) | `createMockClient` for tests — typed handlers + assertions |
| 11 | [11-extend-and-forms.ts](11-extend-and-forms.ts) | `client.extend()` + `formData` / `urlEncoded` helpers |

The first five examples cover the v2 differentiators end-to-end. The rest exercise the supporting feature surface.

## Notes

- All examples are written for **Node ≥ 20.3**. They use only universal Web APIs (`fetch`, `ReadableStream`, `Blob`, `Headers`) so they also run on Bun, Deno, browsers (with a bundler), and edge runtimes.
- Examples that hit the network use [`jsonplaceholder.typicode.com`](https://jsonplaceholder.typicode.com) — a free fake API.
- Examples that demonstrate streaming or mocking use in-process fake fetch implementations so they're deterministic and run offline.
