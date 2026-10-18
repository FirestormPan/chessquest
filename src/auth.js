import {
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { cancelAllLichessSeeks } from './game.js';

const authorizationUrl = 'https://lichess.org/oauth';
const tokenUrl = 'https://lichess.org/api/token';
const accountUrl = 'https://lichess.org/api/account';
const pendingAuthorizations = new Map();
const sessionFile = process.env.CHESSQUEST_SESSION_FILE ?? '.chessquest-sessions.json';
const sessions = loadSessions();

const clientId = process.env.LICHESS_CLIENT_ID ?? 'chessquest.aqw';
const redirectUri = process.env.LICHESS_REDIRECT_URI ?? 'http://localhost:3000/api/auth/lichess/callback';
const scope = process.env.LICHESS_SCOPE ?? 'board:play';
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

function loadSessions() {
  try {
    return new Map(Object.entries(JSON.parse(readFileSync(sessionFile, 'utf8'))));
  } catch {
    return new Map();
  }
}

function saveSessions() {
  writeFileSync(
    sessionFile,
    JSON.stringify(Object.fromEntries(sessions)),
    { mode: 0o600 },
  );
}

function createCodeChallenge(codeVerifier) {
  return createHash('sha256')
    .update(codeVerifier)
    .digest()
    .toString('base64url');
}

function getCookie(request, name) {
  const cookies = request.headers.cookie?.split(';') ?? [];
  const cookie = cookies.find((value) => value.trim().startsWith(`${name}=`));
  return cookie?.trim().slice(name.length + 1);
}

function setSessionCookie(response, sessionId) {
  response.setHeader(
    'Set-Cookie',
    `chessquest_session=${sessionId}; SameSite=None; Secure; Path=/; Max-Age=86400`,
  );
}

function clearSessionCookie(response) {
  response.setHeader(
    'Set-Cookie',
    'chessquest_session=; SameSite=None; Secure; Path=/; Max-Age=0',
  );
}

function getSession(request) {
  let sessionId = getCookie(request, 'chessquest_session');
  // If no cookie, check the URL query string
  if (!sessionId) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    sessionId = url.searchParams.get('sessionId');
  }
  return sessionId ? sessions.get(sessionId) : undefined;
}

export function attachLichessAuth(app) {
  app.get('/api/auth/lichess', (_request, response) => {
    const now = Date.now();
    for (const [pendingState, authorization] of pendingAuthorizations) {
      if (authorization.expiresAt < now) pendingAuthorizations.delete(pendingState);
    }
    const state = randomBytes(32).toString('hex');
    const codeVerifier = randomBytes(32).toString('base64url');

    pendingAuthorizations.set(state, {
      codeVerifier,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      code_challenge: createCodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });

    response.redirect(`${authorizationUrl}?${params}`);
  });

  app.get('/api/auth/lichess/callback', async (request, response) => {
    const { code, state, error } = request.query;
    const authorization = typeof state === 'string' ? pendingAuthorizations.get(state) : undefined;
    pendingAuthorizations.delete(state);

    if (error || !authorization || authorization.expiresAt < Date.now()) {
      response.status(400).json({ error: 'Invalid or expired Lichess authorization' });
      return;
    }

    try {
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: String(code),
          client_id: clientId,
          redirect_uri: redirectUri,
          code_verifier: authorization.codeVerifier,
        }),
      });

      if (!tokenResponse.ok) {
        response.status(502).json({ error: 'Lichess token exchange failed' });
        return;
      }

      const token = await tokenResponse.json();
      const accountResponse = await fetch(accountUrl, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });

      if (!accountResponse.ok) {
        response.status(502).json({ error: 'Lichess account lookup failed' });
        return;
      }

      const sessionId = randomUUID();
      sessions.set(sessionId, {
        accessToken: token.access_token,
        account: await accountResponse.json(),
        expiresAt: Date.now() + (token.expires_in ?? 86400) * 1000,
      });
      saveSessions();
      setSessionCookie(response, sessionId);
      response.redirect(frontendUrl);
    } catch (callbackError) {
      console.error(
        'Lichess OAuth callback failed:',
        callbackError instanceof Error ? callbackError.message : callbackError,
      );
      response.status(502).json({ error: 'Unable to connect to Lichess' });
    }
  });

app.get('/api/auth/me', (request, response) => {
  const session = getSession(request);
  if (!session || session.expiresAt < Date.now()) {
    if (session) {
      const sessionId = getCookie(request, 'chessquest_session');
      removeSession(sessionId);
    }
    response.status(401).json({ authenticated: false });
    return;
  }

  response.json({ authenticated: true, account: session.account });
});

  app.post('/api/auth/logout', (request, response) => {
    const sessionId = getCookie(request, 'chessquest_session');
    removeSession(sessionId);
    clearSessionCookie(response);
    response.status(204).end();
  });
}

export function getAccessToken(request) {
  const session = getSession(request);
  return session && session.expiresAt >= Date.now() ? session.accessToken : null;
}

export function getSessionKey(request) {
  const sessionId = getCookie(request, 'chessquest_session');

  if (!sessionId) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    sessionId = url.searchParams.get('sessionId');
  }
  
  const session = sessionId ? sessions.get(sessionId) : undefined;
  return session && session.expiresAt >= Date.now() ? sessionId : null;
}

function removeSession(sessionId) {
  if (!sessionId) return;
  cancelAllLichessSeeks(sessionId);
  sessions.delete(sessionId);
  saveSessions();
}