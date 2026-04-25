import amu from '../dist/index.js';

async function run() {
  console.log('Example: Advanced retry policy (network + selected status codes)');

  const data = await amu.get('https://jsonplaceholder.typicode.com/users', {
    timeout: 5000,
    retries: {
      attempts: 3,
      delay: (attempt) => 2 ** attempt * 100,
      retryOn: ['network-error', 429, 500, 502, 503, 504],
    },
  });

  console.log(`Fetched ${data.length} users with advanced retry policy.`);
}

run().catch((error) => {
  console.error('Advanced retry example failed:', error);
  process.exitCode = 1;
});
