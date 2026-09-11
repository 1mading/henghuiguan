import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 每次构建写入 hhg-build，便于核对是否打到最新包 */
function hhgBuildStampPlugin() {
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return {
    name: 'hhg-build-stamp',
    transformIndexHtml(html) {
      if (html.includes('name="hhg-build"')) {
        return html.replace(
          /<meta name="hhg-build" content="[^"]*">/,
          `<meta name="hhg-build" content="${stamp}">`,
        );
      }
      return html.replace(
        '<title>',
        `<meta name="hhg-build" content="${stamp}">\n  <title>`,
      );
    },
  };
}

export default defineConfig({
  base: '/',
  root: __dirname,
  publicDir: 'public',
  plugins: [hhgBuildStampPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
