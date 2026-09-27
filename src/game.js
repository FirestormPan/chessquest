const lichessUrl = 'https://lichess.org';
const activeSeeks = new Map();
const cancelledSeeks = new Set();
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

export function attachGameRoutes(app, getAccessToken) {
  app.post('/api/game/start', async (request, response) => {

    const { time, increment, rated = false } = request.body ?? {};
    if (!isAllowedTimeControl(time, increment)) {
      response.status(400).json({ error: 'Invalid time control' });
      return;
    }
    if (rated) {
      // See "rated restriction" section below
      if (time < 600) {
        response.status(400).json({ error: 'Rated board API games must be Rapid or slower' });
        return;
      }
    }

    const accessToken = getAccessToken(request);
    if (!accessToken) {
      response.status(401).json({ error: 'Lichess login required' });
      return;
    }

    if (activeSeeks.has(accessToken)) {
      response.status(409).json({ error: 'A game search is already active' });
      return;
    }

    cancelledSeeks.delete(accessToken);

    const seek = {
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
    activeSeeks.set(accessToken, seek);

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
          time: String(time/60),
          increment: String(increment),
        }),
        signal: seek.controller.signal,
      });
    } catch {
      if (activeSeeks.get(accessToken) === seek) activeSeeks.delete(accessToken);
      if (seek.cancelRequested) {
        response.status(202).json({ status: 'cancelled' });
        return;
      }
      response.status(502).json({ error: 'Unable to connect to Lichess' });
      return;
    }

    if (!seekResponse.ok) {
      if (activeSeeks.get(accessToken) === seek) activeSeeks.delete(accessToken);
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
        if (error.name !== 'AbortError') {
          console.error('Lichess seek stream failed:', error);
        }
      })
      .finally(() => {
        resolveSeekId(null);
        if (activeSeeks.get(accessToken) === seek) activeSeeks.delete(accessToken);
      });

    response.status(202).json({ status: 'searching' });
  });

  app.post('/api/game/cancel', async (request, response) => {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      response.status(401).json({ error: 'Lichess login required' });
      return;
    }

    const seek = activeSeeks.get(accessToken);
    if (!seek) {
      response.status(404).json({ error: 'No active game search' });
      return;
    }

    cancelledSeeks.add(accessToken);
    seek.cancelRequested = true;
    seek.controller.abort();
    if (activeSeeks.get(accessToken) === seek) activeSeeks.delete(accessToken);
    response.status(202).json({ status: 'cancelled' });
  });
}

export function isSeekCancelled(accessToken) {
  return cancelledSeeks.has(accessToken);
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

export async function sendLichessMove(accessToken, gameId, uci) {
  return fetch(`${lichessUrl}/api/board/game/${gameId}/move/${uci}`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
  });
}

export async function resignLichessGame(accessToken, gameId) {
  return fetch(`${lichessUrl}/api/board/game/${gameId}/resign`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
  });
}

export async function handleLichessDraw(accessToken, gameId, accept) {
  return fetch(`${lichessUrl}/api/board/game/${gameId}/draw/${accept}`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
  });
}

export async function claimLichessVictory(accessToken, gameId) {
  return fetch(`${lichessUrl}/api/board/game/${gameId}/claim-victory`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
  });
}

export async function sendLichessChat(accessToken, gameId, room, text) {
  return fetch(`${lichessUrl}/api/board/game/${gameId}/chat`, {
    method: 'POST',
    headers: {
      ...authorizationHeaders(accessToken),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ room, text }),
  });
}