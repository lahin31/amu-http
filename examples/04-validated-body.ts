/**
 * 04: Schema-validated request bodies.
 *
 * `schema.body` validates the outgoing payload BEFORE the request leaves your
 * machine. Wrong shapes throw `AmuValidationError` with `target: 'request'`,
 * never reaching the network.
 *
 * Run: npx tsx examples/04-validated-body.ts
 */

import { AmuValidationError, createClient } from 'amu-http';
import { z } from 'zod';

const api = createClient({ baseURL: 'https://jsonplaceholder.typicode.com' });

const CreatePost = z.object({
  title: z.string().min(3),
  body: z.string().min(10),
  userId: z.number().int().positive(),
});

const Post = CreatePost.extend({ id: z.number() });

// Happy path — body matches schema, response gets validated too.
const created = await api.post(
  '/posts',
  { title: 'Hello v2', body: 'This is amu-http with schema validation.', userId: 1 },
  { schema: { body: CreatePost, response: Post } },
);
console.log('Created post id:', created.id);

// Failure path — bad body caught locally.
try {
  await api.post(
    '/posts',
    // @ts-expect-error — deliberately wrong type to demonstrate runtime guard
    { title: 'oh', body: 'short', userId: 'wrong' },
    { schema: { body: CreatePost } },
  );
} catch (err) {
  if (err instanceof AmuValidationError && err.target === 'request') {
    console.log('Validation caught locally:');
    for (const issue of err.issues) console.log('  ·', issue.message);
  }
}
