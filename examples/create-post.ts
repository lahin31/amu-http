import amu from '../dist/index.mjs';

interface CreatedPost {
  id: number;
  title: string;
  body: string;
  userId: number;
}

async function run() {
  console.log('Example: POST JSON body');

  const post = await amu.post<CreatedPost>('https://jsonplaceholder.typicode.com/posts', {
    title: 'hello from amu',
    body: 'lightweight fetch wrapper',
    userId: 1,
  });

  console.log('Created post id:', post.id);
  console.log('Created post title:', post.title);
}

run().catch((error) => {
  console.error('POST example failed:', error);
  process.exitCode = 1;
});
