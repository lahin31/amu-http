import amu from '../dist/index.js';

async function run() {
  console.log('Example: GET users');

  const users = await amu.get('https://jsonplaceholder.typicode.com/users');
  console.log(`Fetched ${users.length} users.`);
  console.log('First user:', users[0]?.name);
}

run().catch((error) => {
  console.error('GET example failed:', error);
  process.exitCode = 1;
});
