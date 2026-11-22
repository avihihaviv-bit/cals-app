import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves a project site from /<repo-name>/, so asset URLs need that
// prefix there — set only by the deploy workflow; local dev/build stay at '/'.
const base = process.env.GITHUB_PAGES === 'true' ? '/cals-app/' : '/';

const buildId = `${(process.env.GITHUB_SHA ?? 'local').slice(0, 7)} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;

export default defineConfig({
  base,
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    react(),
    {
      // version.json lets the running app notice a new release and update itself (see useAutoUpdate).
      name: 'version-file',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: buildId }) });
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
