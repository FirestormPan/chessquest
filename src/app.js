import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import rateLimit from 'express-rate-limit';

import { attachLichessAuth, getAccessToken, getSessionKey } from './auth.js';
import { attachGameRoutes } from './game.js';

const app = express();
app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);


const gameLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
});
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
});

app.use('/api/game/start', gameLimiter);
app.use('/api/game/cancel', gameLimiter);
app.use('/api/auth/lichess', authLimiter);


attachLichessAuth(app);
attachGameRoutes(app, getAccessToken, getSessionKey);

app.get('/api/health', async (_request, response) => {
  const start = Date.now();
  try {
    const res = await fetch('https://lichess.org/api/account', {
      method: 'HEAD',
      signal: AbortSignal.timeout(2000),
    });
    response.json({
      status: 'ok',
      lichess: res.ok ? 'reachable' : `http_${res.status}`,
      latencyMs: Date.now() - start,
    });
  } catch (error) {
    response.status(503).json({
      status: 'degraded',
      lichess: 'unreachable',
      error: error.message,
    });
  }
});

let skinsCache = null;
app.get('/api/skins', async (_request, response) => {
  if(skinsCache) {
    response.json(skinsCache);
    return;
  }
  try {
    const entries = await readdir(path.resolve('images'), { withFileTypes: true });
    skinsCache = {
      skins: entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(),
    };
    response.json(skinsCache);
  } catch {
    response.status(500).json({ error: 'Unable to load piece skins' });
  }
});

export default app;
