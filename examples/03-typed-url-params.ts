/**
 * 03: Type-safe URL parameters.
 *
 * The compiler enforces that every `:name` placeholder has a matching key in
 * `params`. Forgetting one is a compile error.
 *
 * Run: npx tsx examples/03-typed-url-params.ts
 */

import { createClient } from 'amu-http';
import { z } from 'zod';

const api = createClient({ baseURL: 'https://jsonplaceholder.typicode.com' });

const Post = z.object({
  id: z.number(),
  userId: z.number(),
  title: z.string(),
  body: z.string(),
});

const post = await api.get('/users/:userId/posts', {
  params: { userId: 1 },
  schema: { response: z.array(Post) },
});

console.log(`User 1 has ${post.length} posts`);
console.log('First post title:', post[0]?.title);

// Examples that would FAIL at compile time:
//
// api.get('/users/:userId/posts', {});
// ❌ Property 'params' is missing
//
// api.get('/users/:userId/posts', { params: { id: 1 } });
// ❌ 'id' does not exist; did you mean 'userId'?
