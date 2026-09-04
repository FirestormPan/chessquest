import 'dotenv/config';
import http from 'node:http';

import app from './app.js';
import { getAccessToken } from './auth.js';
import { attachWebSocketServer } from './websocket.js';

const port = Number(process.env.PORT ?? 3000);
const server = http.createServer(app);

attachWebSocketServer(server, getAccessToken);

server.listen(port, () => {
  console.log(`ChessQuest backend listening on http://localhost:${port}`);
});
