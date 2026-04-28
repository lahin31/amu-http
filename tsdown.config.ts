import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/middleware/auth.ts',
    'src/middleware/requestId.ts',
    'src/middleware/logger.ts',
    'src/middleware/otel.ts',
    'src/middleware/cookies.ts',
    'src/test/mock.ts',
    'src/forms/index.ts',
    'src/pagination/index.ts',
  ],
  external: ['@opentelemetry/api'],
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
