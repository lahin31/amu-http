import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
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
