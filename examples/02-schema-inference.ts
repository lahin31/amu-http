/**
 * 02: Schema-inferred response types (the v2 wedge).
 *
 * The TypeScript return type follows the schema — no `<T>` annotation needed.
 * Same code works with Valibot or ArkType in place of Zod.
 *
 * Run: npx tsx examples/02-schema-inference.ts
 */

import { createClient } from 'amu-http';
import { z } from 'zod';

const api = createClient({ baseURL: 'https://jsonplaceholder.typicode.com' });

const User = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  username: z.string(),
});

const user = await api.get('/users/:id', {
  params: { id: 1 },
  schema: { response: User },
});

// `user` is z.infer<typeof User> — { id, name, email, username }
// Hover in your editor: TypeScript narrows it automatically.
console.log('User:', user.name);
console.log('Email:', user.email);
console.log('Username:', user.username);
