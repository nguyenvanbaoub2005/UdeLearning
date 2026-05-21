import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Reduce unnecessary restarts by ignoring changes in node_modules and .git
    watch: {
      ignored: ['**/node_modules/**', '**/.git/**'],
    },
    // Enable HMR without full page reload for CSS/JS changes
    hmr: {
      overlay: false,
    },
    // Prevent Vite from clearing the console on each restart (helps debugging)
    clearScreen: false,
  },
});