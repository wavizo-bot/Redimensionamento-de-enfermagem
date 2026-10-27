import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
  server: {
    watch: {
      // O build do MSIX gera arquivos temporarios em msix/; nao observar.
      ignored: ['**/msix/**', '**/dist/**', '**/docs/**', '**/entregas/**'],
    },
  },
});
