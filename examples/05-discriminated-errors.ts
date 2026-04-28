/**
 * 05: Discriminated errors via `client.safe.*`.
 *
 * The `safe` namespace wraps every method to return `Result<T>` instead of
 * throwing. The `error` is a tagged union of 5 classes, narrowable via switch.
 *
 * Run: npx tsx examples/05-discriminated-errors.ts
 */

import { createClient } from 'amu-http';
import { z } from 'zod';

const api = createClient({ baseURL: 'https://jsonplaceholder.typicode.com' });

const User = z.object({ id: z.number(), name: z.string(), email: z.string() });

const result = await api.safe.get('/users/:id', {
  params: { id: 9999 }, // doesn't exist — will produce HTTP 404
  schema: { response: User },
});

if (result.ok) {
  console.log('User:', result.data.name);
} else {
  switch (result.error.name) {
    case 'AmuError':
      console.log(`HTTP error: ${result.error.status} ${result.error.statusText}`);
      console.log('Server said:', result.error.data);
      break;

    case 'AmuNetworkError':
      console.log(`Transport error: kind=${result.error.kind}`);
      console.log(`Retryable: ${result.error.isRetryable}`);
      break;

    case 'AmuUrlError':
      console.log(`Bad URL: ${result.error.input}`);
      if (result.error.suggestion) console.log(`  Did you mean: ${result.error.suggestion}?`);
      break;

    case 'AmuValidationError':
      console.log(`Validation failed (${result.error.target}):`);
      for (const issue of result.error.issues) console.log('  ·', issue.message);
      break;

    case 'AmuUnknownError':
      console.log('Unexpected:', result.error.cause);
      break;
  }
  // TypeScript will error here if any case is missed.
}
