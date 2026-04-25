import amu from '../dist/index.js';

async function run() {
  console.log('Example: Bearer token auth');

  const token = process.env.API_TOKEN || 'your-token-here';

  const profile = await amu.get('https://jsonplaceholder.typicode.com/users/1', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  console.log('Authenticated request succeeded.');
  console.log('User:', profile.name);
}

run().catch((error) => {
  console.error('Bearer token example failed:', error);
  process.exitCode = 1;
});
