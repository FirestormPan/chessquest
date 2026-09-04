import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

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

export default app;
