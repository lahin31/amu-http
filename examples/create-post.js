import amu from '../dist/index.js';

async function run() {
  console.log('Example: POST JSON body');

  const post = await amu.post('https://jsonplaceholder.typicode.com/posts', {
    json: {
      title: 'hello from amu',
      body: 'lightweight fetch wrapper',
      userId: 1,
    },
  });

  console.log('Created post id:', post.id);
  console.log('Created post title:', post.title);
}

run().catch((error) => {
  console.error('POST example failed:', error);
  process.exitCode = 1;
});
