import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/middleware/auth.ts',
    'src/middleware/requestId.ts',
    'src/middleware/logger.ts',
    'src/test/mock.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  minify: true,
  outDir: 'dist',
  target: 'es2022',
  tsconfig: 'tsconfig.build.json',
  treeshake: true,
  sourcemap: false,
  outputOptions: {
    exports: 'named',
  },
});
