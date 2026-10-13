const lichessUrl = 'https://lichess.org';
const activeSeeks = new Map();
// Later should be Shared with the frontend via a config module
const ALLOWED_TIME_CONTROLS = {
  ultraBullet: [{ time: 15, inc: 0 }, { time: 30, inc: 0 }],
  bullet:      [{ time: 60, inc: 0 }, { time: 120, inc: 1 }],
  blitz:       [{ time: 180, inc: 0 }, { time: 180, inc: 2 }, { time: 300, inc: 0 }, { time: 300, inc: 3 }],
  rapid:       [{ time: 600, inc: 0 }, { time: 600, inc: 5 }, { time: 900, inc: 10 }, { time: 1800, inc: 0 }],
  classical:   [{ time: 1800, inc: 20 }, { time: 3600, inc: 30 }],
};

function authorizationHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` };
}

function formatLichessError(errorBody) {
  try {
    const parsed = JSON.parse(errorBody);
    const error = parsed.error ?? parsed.message ?? parsed;
    return typeof error === 'string' ? error : JSON.stringify(error);
  } catch {
    return errorBody.trim();
  }
}

async function readNdjson(response, onMessage, signal) {
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        parseNdjsonLine(line, onMessage);
      }
    }

    parseNdjsonLine(buffer, onMessage);
  } finally {
    reader.releaseLock();
  }
}

function parseNdjsonLine(line, onMessage) {
  if (!line.trim()) return;

  try {
    onMessage(JSON.parse(line));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Lichess returned an invalid event');
    }
    throw error;
  }
}

function isAllowedTimeControl(time, increment) {
  return Object.values(ALLOWED_TIME_CONTROLS)
    .flat()
    .some((tc) => tc.time === time && tc.inc === increment);
}

export function attachGameRoutes(app, getAccessToken, getSessionKey) {
  app.post('/api/game/start', async (request, response) => {
    const { time, increment, rated = false, attemptId } = request.body ?? {};
    if (typeof attemptId !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(attemptId)) {
      response.status(400).json({ error: 'Invalid matchmaking attempt' });
      return;
    }
    if (typeof rated !== 'boolean' || !isAllowedTimeControl(time, increment)) {
      response.status(400).json({ error: 'Invalid game settings' });
      return;
    }
    if (rated && time < 600) {
      response.status(400).json({ error: 'Rated board API games must be Rapid or slower' });
      return;
    }

    const accessToken = getAccessToken(request);
    const sessionKey = getSessionKey(request);
    if (!accessToken || !sessionKey) {
      response.status(401).json({ error: 'Lichess login required' });
      return;
    }
    if (activeSeeks.has(sessionKey)) {
      response.status(409).json({ error: 'A game search is already active' });
      return;
    }

    const seek = {
      attemptId,
      controller: new AbortController(),
      id: null,
      idPromise: null,
      params: { time, increment, rated },
      startedAt: Date.now(),
    };
    let resolveSeekId;
    seek.idPromise = new Promise((resolve) => {
      resolveSeekId = resolve;
    });
    activeSeeks.set(sessionKey, seek);

    let seekResponse;
    try {
      seekResponse = await fetch(`${lichessUrl}/api/board/seek`, {
        method: 'POST',
        headers: {
          ...authorizationHeaders(accessToken),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          rated: rated ? 'true' : 'false',
          variant: 'standard',
          time: String(time / 60),
          increment: String(increment),
        }),
        signal: seek.controller.signal,
      });
    } catch {
      if (activeSeeks.get(sessionKey) === seek) activeSeeks.delete(sessionKey);
      if (seek.cancelRequested) {
        response.status(202).json({ status: 'cancelled' });
        return;
      }
      response.status(502).json({ error: 'Unable to connect to Lichess' });
      return;
    }

    if (!seekResponse.ok) {
      if (activeSeeks.get(sessionKey) === seek) activeSeeks.delete(sessionKey);
      const lichessError = formatLichessError(await seekResponse.text());
      const status = seekResponse.status === 403 ? 403 : 502;
      const message = seekResponse.status === 403
        ? 'Lichess denied gameplay permission. Log out and log in again to grant board:play.'
        : `Unable to start a Lichess game search${lichessError ? `: ${lichessError}` : ''}`;
      response.status(status).json({ error: message });
      return;
    }

    void readNdjson(seekResponse, (event) => {
      if (typeof event.id === 'string') {
        seek.id = event.id;
        resolveSeekId(event.id);
      }
    }, seek.controller.signal)
      .catch((error) => {
        if (error.name !== 'AbortError') console.error('Lichess seek stream failed:', error);
      })
      .finally(() => {
        resolveSeekId(null);
        if (activeSeeks.get(sessionKey) === seek && !seek.cancelRequested) {
          const cleanup = setTimeout(() => {
            if (activeSeeks.get(sessionKey) === seek) activeSeeks.delete(sessionKey);
          }, 10_000);
          cleanup.unref?.();
        }
      });

    response.status(202).json({ status: 'searching' });
  });

  app.post('/api/game/cancel', (request, response) => {
    const sessionKey = getSessionKey(request);
    const { attemptId } = request.body ?? {};
    if (!sessionKey) {
      response.status(401).json({ error: 'Lichess login required' });
      return;
    }
    if (!cancelLichessSeek(sessionKey, attemptId)) {
      response.status(404).json({ error: 'No matching active game search' });
      return;
    }
    response.status(202).json({ status: 'cancelled' });
  });
}

export function claimLichessSeek(sessionKey, attemptId) {
  const seek = activeSeeks.get(sessionKey);
  if (!seek || seek.cancelRequested || seek.attemptId !== attemptId) return false;
  activeSeeks.delete(sessionKey);
  return true;
}

export function cancelLichessSeek(sessionKey, attemptId) {
  const seek = activeSeeks.get(sessionKey);
  if (!seek || seek.attemptId !== attemptId) return false;
  seek.cancelRequested = true;
  seek.controller.abort();
  activeSeeks.delete(sessionKey);
  return true;
}

export function startLichessEventStream(accessToken, onEvent, signal) {
  return fetch(`${lichessUrl}/api/stream/event`, {
    headers: authorizationHeaders(accessToken),
    signal,
  }).then((response) => {
    if (!response.ok) throw new Error(`Lichess event stream failed: ${response.status}`);
    return readNdjson(response, onEvent, signal);
  });
}

export function startLichessGameStream(accessToken, gameId, onEvent, signal) {
  return fetch(`${lichessUrl}/api/board/game/stream/${gameId}`, {
    headers: authorizationHeaders(accessToken),
    signal,
  }).then((response) => {
    if (!response.ok) throw new Error(`Lichess game stream failed: ${response.status}`);
    return readNdjson(response, onEvent, signal);
  });
}

export async function sendLichessMove(accessToken, gameId, uci, signal) {
  return fetch(`${lichessUrl}/api/board/game/${gameId}/move/${uci}`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    signal,
  });
}

export async function handleLichessTakeback(accessToken, gameId, action, signal) {
  const suffix = action === 'decline' ? '/no' : '/yes';

  return fetch(`${lichessUrl}/api/board/game/${gameId}/takeback${suffix}`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    signal,
  });
}

export async function resignLichessGame(accessToken, gameId, signal) {
  return fetch(`${lichessUrl}/api/board/game/${gameId}/resign`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    signal,
  });
}

export async function handleLichessDraw(accessToken, gameId, accept, signal) {
  return fetch(`${lichessUrl}/api/board/game/${gameId}/draw/${accept}`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    signal,
  });
}

export async function claimLichessVictory(accessToken, gameId, signal) {
  return fetch(`${lichessUrl}/api/board/game/${gameId}/claim-victory`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    signal,
  });
}

export async function sendLichessChat(accessToken, gameId, room, text, signal) {
  return fetch(`${lichessUrl}/api/board/game/${gameId}/chat`, {
    method: 'POST',
    headers: {
      ...authorizationHeaders(accessToken),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ room, text }),
    signal,
  });
}

export async function createRematchChallenge(accessToken, opponentUsername, gameId, timeControl, rated) {
  const body = new URLSearchParams({
    'clock.limit': String(timeControl.time / 60), // Lichess expects minutes here
    'clock.increment': String(timeControl.increment),
    'rated': rated ? 'true' : 'false',
    'color': 'random',
    'rematchOf': gameId, // The critical field linking back to the old game
  });

  return fetch(`${lichessUrl}/api/challenge/${opponentUsername}`, {
    method: 'POST',
    headers: {
      ...authorizationHeaders(accessToken),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
}

export async function acceptLichessChallenge(accessToken, challengeId, color = 'random') {
  const query = color !== 'random' ? `?color=${color}` : '';
  return fetch(`${lichessUrl}/api/challenge/${challengeId}/accept${query}`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
  });
}