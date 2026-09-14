import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { attachLichessAuth, getAccessToken } from './auth.js';
import { attachGameRoutes } from './game.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

attachLichessAuth(app);
attachGameRoutes(app, getAccessToken);

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/api/skins', async (_request, response) => {
  try {
    const entries = await readdir(path.resolve('images'), { withFileTypes: true });
    response.json({
      skins: entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(),
    });
  } catch {
    response.status(500).json({ error: 'Unable to load piece skins' });
  }
});

export default app;
