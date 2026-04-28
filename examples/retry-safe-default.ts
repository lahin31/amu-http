import amu from '../dist/index.mjs';

interface User {
  id: number;
}

async function run() {
  console.log('Example: Safe default retries (network errors only)');
  console.log('Config -> retries: 2, timeout: 5000ms');

  const originalFetch = globalThis.fetch;
  let firstCall = true;
  globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
    if (firstCall) {
      firstCall = false;
      console.log('Attempt 1 -> simulated network failure');
      throw new Error('Synthetic network error (demo)');
    }
    console.log('Attempt 2 -> request sent successfully');
    return originalFetch(...args);
  };

  console.log('Sending request...');
  const data = await amu.get<User[]>('https://jsonplaceholder.typicode.com/users', {
    retries: 2,
    timeout: 5000,
  });

  globalThis.fetch = originalFetch;
  console.log('Retry flow completed successfully.');
  console.log(`Fetched ${data.length} users after safe retry policy.`);
}

run().catch((error) => {
  console.error('Safe retry example failed:', error);
  process.exitCode = 1;
});
