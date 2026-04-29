/**
 * 01: GET with the default singleton — a one-liner against an absolute URL.
 *
 * Run: npx tsx examples/01-basic-get.ts
 */
import { amu } from 'amu-http';

interface User {
  id: number;
  name: string;
  email: string;
}

const users = await amu.get<User[]>('https://jsonplaceholder.typicode.com/users');

console.log(`Fetched ${users.length} users.`);
console.log('First user:', users[0]?.name, '-', users[0]?.email);
