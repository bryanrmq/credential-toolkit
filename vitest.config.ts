import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'packages/*/test/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // styles.test.ts reads styles.css?raw, which Vitest leaves empty unless it processes the file.
    css: { include: [/styles\.css/] },
  },
});
