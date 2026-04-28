import amu from '../dist/index.mjs';

interface User {
  id: number;
  name: string;
  email: string;
}

async function run() {
  console.log('Example: GET users');

  const users = await amu.get<User[]>('https://jsonplaceholder.typicode.com/users');
  console.log(`Fetched ${users.length} users.`);
  console.log('First user:', users[0]?.name);
}

run().catch((error) => {
  console.error('GET example failed:', error);
  process.exitCode = 1;
});
