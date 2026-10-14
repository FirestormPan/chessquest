import 'dotenv/config';
import http from 'node:http';

import app from './app.js';
import { getAccessToken, getSessionKey } from './auth.js';
import { attachWebSocketServer } from './websocket.js';

const port = Number(process.env.PORT ?? 3000);
const server = http.createServer(app);

attachWebSocketServer(server, getAccessToken, getSessionKey);

server.listen(port, () => {
  console.log(`ChessQuest backend listening on http://localhost:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  // Force exit if close() hangs (e.g. keep-alive connections).
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Do not exit. Node's default is to exit; overriding it here keeps
  // the process alive for the other users. If the error is truly
  // fatal, the next request will surface it again.
});