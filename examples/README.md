# Examples

These are TypeScript files run via [`tsx`](https://github.com/privatenumber/tsx) (no compile step). They import the built bundle from `../dist/index.mjs`, so build first.

```bash
npm run build

npx tsx examples/get-users.ts
npx tsx examples/create-post.ts
npx tsx examples/bearer-token.ts
npx tsx examples/retry-safe-default.ts
npx tsx examples/retry-advanced.ts
```

Or via npm scripts (each runs `npm run build` first):

```bash
npm run example:get
npm run example:post
npm run example:bearer
npm run example:retry:safe
npm run example:retry:advanced
```
