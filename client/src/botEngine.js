const ENGINE_URL = '/bot-engine/stockfish.wasm.js';
export const BOT_STRENGTHS = [400, 800, 1000, 1200, 1500, 1800, 2000];

const BOT_PROFILES = {
  400: { skillLevel: 0, moveTimeMs: 80 },
  800: { skillLevel: 0, moveTimeMs: 180 },
  1000: { skillLevel: 0, moveTimeMs: 350 },
  1200: { skillLevel: 2, moveTimeMs: 350 },
  1500: { skillLevel: 5, moveTimeMs: 350 },
  1800: { skillLevel: 9, moveTimeMs: 350 },
  2000: { skillLevel: 13, moveTimeMs: 350 },
};

let engineWorker = null;
let engineReady = null;
let activeSearch = null;
let requestQueue = Promise.resolve();
const lineWaiters = [];

function waitForLine(prefix) {
  return new Promise((resolve, reject) => {
    lineWaiters.push({ prefix, resolve, reject });
  });
}

function handleEngineMessage(event) {
  const line = String(event.data);
  const waiterIndex = lineWaiters.findIndex(({ prefix }) =>
    line.startsWith(prefix),
  );

  if (waiterIndex !== -1) {
    lineWaiters.splice(waiterIndex, 1)[0].resolve(line);
  }

  if (line.startsWith('bestmove ') && activeSearch) {
    const search = activeSearch;
    activeSearch = null;
    search.resolve(line);
  }
}

function failEngine(error) {
  for (const waiter of lineWaiters.splice(0)) {
    waiter.reject(error);
  }

  if (activeSearch) {
    const search = activeSearch;
    activeSearch = null;
    search.resolve(null);
  }
}

function getEngine() {
  if (engineReady) return engineReady;

  const worker = new Worker(ENGINE_URL);
  engineWorker = worker;
  worker.addEventListener('message', handleEngineMessage);
  worker.addEventListener('error', (event) => {
    if (engineWorker !== worker) return;
    failEngine(event.error ?? new Error('Stockfish worker failed to load'));
    worker.terminate();
    engineWorker = null;
    engineReady = null;
  });

  const ready = waitForLine('uciok');
  engineReady = ready.then(() => worker).catch((error) => {
    worker.terminate();
    if (engineWorker === worker) {
      engineWorker = null;
      engineReady = null;
    }
    throw error;
  });
  worker.postMessage('uci');

  return engineReady;
}

async function synchronize(worker) {
  const ready = waitForLine('readyok');
  worker.postMessage('isready');
  await ready;
}

function parseBestMove(line) {
  const uci = line?.split(/\s+/)[1];
  if (!uci || uci === '(none)' || uci === '0000') return null;

  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4] || undefined,
  };
}

async function searchPosition(fen, strength, signal) {
  if (signal?.aborted) return null;

  const worker = await getEngine();
  if (signal?.aborted) return null;

  const profile = BOT_PROFILES[strength] ?? BOT_PROFILES[1000];
  worker.postMessage(`setoption name Skill Level value ${profile.skillLevel}`);

  await synchronize(worker);
  if (signal?.aborted) return null;

  worker.postMessage(`position fen ${fen}`);

  let search;
  const result = new Promise((resolve) => {
    search = { resolve };
    activeSearch = search;
  });

  const stopSearch = () => {
    if (activeSearch === search) worker.postMessage('stop');
  };

  signal?.addEventListener('abort', stopSearch, { once: true });
  if (signal?.aborted) {
    signal.removeEventListener('abort', stopSearch);
    if (activeSearch === search) {
      activeSearch = null;
      search.resolve(null);
    }
    return null;
  }

  worker.postMessage(`go movetime ${profile.moveTimeMs}`);
  const bestMove = await result;
  signal?.removeEventListener('abort', stopSearch);

  return signal?.aborted ? null : parseBestMove(bestMove);
}

export function getBotMove(fen, { strength = 1000, signal } = {}) {
  const request = requestQueue.then(() =>
    searchPosition(fen, strength, signal),
  );
  requestQueue = request.then(() => undefined, () => undefined);
  return request;
}