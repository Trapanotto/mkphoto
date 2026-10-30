import { defineConfig } from 'vite';

// relative Pfade: läuft lokal und auf GitHub Pages (/mkphoto/)
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
});
