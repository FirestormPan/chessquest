import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientDirectory = path.dirname(fileURLToPath(import.meta.url));
const botEngineDirectory = path.join(clientDirectory, 'bot-engine');

function botEngineAssets() {
  return {
    name: 'bot-engine-assets',
    configureServer(server) {
      server.middlewares.use('/bot-engine', async (request, response, next) => {
        const filename = path.basename(
          new URL(request.url, 'http://localhost').pathname,
        );

        if (!['stockfish.wasm.js', 'stockfish.wasm'].includes(filename)) {
          next();
          return;
        }

        try {
          const contents = await readFile(
            path.join(botEngineDirectory, filename),
          );
          response.setHeader(
            'Content-Type',
            filename.endsWith('.wasm')
              ? 'application/wasm'
              : 'text/javascript',
          );
          response.end(contents);
        } catch (error) {
          next(error);
        }
      });
    },
    async writeBundle(outputOptions) {
      if (!outputOptions.dir) return;

      await cp(
        botEngineDirectory,
        path.join(outputOptions.dir, 'bot-engine'),
        { recursive: true },
      );
    },
  };
}

export default defineConfig({
  root: 'client',
  publicDir: '../images',
  plugins: [react(), botEngineAssets()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
});
