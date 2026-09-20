import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'vigie-build-version',
      transformIndexHtml(html) {
        return html.replace('<head>', `<head>\n    <meta name="vigie-version" content="${pkg.version}">`);
      }
    }
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  }
});
