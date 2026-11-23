import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Source files use JSX inside .js files (Babel handles this in the webpack build)
  esbuild: { loader: 'jsx', include: /src\/.*\.jsx?$/, exclude: [] },
  test: { include: ['src/**/*.test.js'] },
});
