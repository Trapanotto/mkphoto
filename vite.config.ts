import { defineConfig } from 'vite';

// GitHub Pages serves the site under /mkphoto/
export default defineConfig({
  base: '/mkphoto/',
  // three.js alone is ~550 kB; that is expected for now
  build: { chunkSizeWarningLimit: 800 },
});
