import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// GitHub Pages serves the site under /<repository>/; the deploy workflow sets BASE_PATH.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
});
