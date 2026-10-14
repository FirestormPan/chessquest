import { WebSocket, WebSocketServer } from 'ws';

import {
  handleLichessDraw,
  claimLichessSeek,
  cancelLichessSeek,
  resignLichessGame,
  sendLichessChat,
  sendLichessMove,
  startLichessEventStream,
  startLichessGameStream,
  claimLichessVictory,
  handleLichessTakeback,
} from './game.js';

const MAX_BUFFERED_SOCKET_BYTES = 1024 * 1024;
const COMMAND_TIMEOUT_MS = 15_000;


function send(socket, message) {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (socket.bufferedAmount > MAX_BUFFERED_SOCKET_BYTES) {
    socket.close(1013, 'Client is not reading game events');
    return;
  }
  try {
    socket.send(JSON.stringify(message));
  } catch {
    socket.close();
  }
}

const allowedOrigin = new URL(process.env.FRONTEND_URL ?? 'http://localhost:5173').origin;

function isAllowedOrigin(origin) {
  return origin === allowedOrigin;
}

async function responseError(response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body);
    return JSON.stringify(parsed.error ?? parsed.message ?? parsed);
  } catch {
    return body.trim() || `HTTP ${response.status}`;
  }
}

async function maintainEventStream(accessToken, onEvent, signal, onLost) {
  const safeOnEvent = (event) => {
    try {
      onEvent(event);
    } catch (error) {
      console.error('Event handler threw:', error);
    }
  };

  let attempt = 0;
  while (!signal.aborted) {
    let error = null;
    try {
      await startLichessEventStream(accessToken, safeOnEvent, signal);
    } catch (caught) {
      if (signal.aborted || caught.name === 'AbortError') return;
      error = caught;
    }
    if (signal.aborted) return;
    attempt += 1;
    if (attempt === 1) {
      try {
        onLost(error?.message ?? 'Lichess event stream closed');
      } catch (handlerError) {
        console.error('onLost handler threw:', handlerError);
      }
    }
    const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function maintainGameStream(accessToken, gameId, onEvent, signal, onLost) {
  const safeOnEvent = (event) => {
    try {
      onEvent(event);
    } catch (error) {
      console.error('Game event handler threw:', error);
    }
  };

  let attempt = 0;
  while (!signal.aborted) {
    let error = null;
    try {
      await startLichessGameStream(accessToken, gameId, safeOnEvent, signal);
    } catch (caught) {
      if (signal.aborted || caught.name === 'AbortError') return;
      if (/404/.test(caught.message ?? '')) {
        onLost('Game no longer available on Lichess');
        return;
      }
      error = caught;
    }
    if (signal.aborted) return;
    attempt += 1;
    if (attempt === 1) {
      try {
        onLost(error?.message ?? 'Lichess game stream closed');
      } catch (handlerError) {
        console.error('onLost handler threw:', handlerError);
      }
    }
    const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export function attachWebSocketServer(server, getAccessToken, getSessionKey) {
  const webSocketServer = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 16 * 1024,
  });

  webSocketServer.on('connection', (socket, request) => {
    if (!isAllowedOrigin(request.headers.origin)) {
      socket.close(1008, 'Untrusted origin');
      return;
    }

    let accessToken = getAccessToken(request);
    let sessionKey = getSessionKey(request);
    if (!accessToken || !sessionKey) {
      send(socket, { type: 'error', message: 'Lichess login required' });
      socket.close();
      return;
    }

    const abortController = new AbortController();
    let gameId = null;
    let gameStreamController = null;
    let awaitingMatchAttemptId = null;
    let resumable = false;
    let commandQueue = Promise.resolve();
    let commandWindowStartedAt = Date.now();
    let commandCount = 0;

    maintainEventStream(accessToken, (event) => {
      // Handle incoming challenges
      if (event.type === 'challenge' && event.challenge) {
        const challenge = event.challenge;
        // Only forward if it's a rematch of the current game
        if (challenge.rematchOf && challenge.rematchOf === gameId) {
          send(socket, {
            type: 'game.rematch.offered',
            challengeId: challenge.id,
            challengerName: challenge.challenger?.name,
          });
        }
      }

      if (event.type !== 'gameStart' || gameId) return;

      const isSolicited = Boolean(awaitingMatchAttemptId);
      const isResume = resumable && !isSolicited;

      if (!isSolicited && !isResume) return;

      const nextGameId = event.game?.gameId ?? event.game?.id;
      if (!nextGameId) {
        send(socket, {
          type: 'error',
          scope: 'matchmaking',
          message: 'Lichess game event did not include a game ID',
        });
        return;
      }

      if (isSolicited && !claimLichessSeek(sessionKey, awaitingMatchAttemptId)) {
        awaitingMatchAttemptId = null;
        return;
      }

      awaitingMatchAttemptId = null;
      resumable = false;
      gameId = nextGameId;
      send(socket, { type: 'game.found', gameId });

      gameStreamController = new AbortController();
      maintainGameStream(
        accessToken,
        gameId,
        (gameEvent) => {
          send(socket, { type: 'game.event', event: gameEvent });

          const isTerminal =
            (gameEvent.type === 'gameState' && gameEvent.status !== 'started') ||
            (gameEvent.type === 'gameFull' && gameEvent.state && gameEvent.state?.status !== 'started');

          if (isTerminal) {
            gameStreamController?.abort();
            gameStreamController = null;
            gameId = null;
          }
        },
        gameStreamController.signal,
        (message) => {
          send(socket, { type: 'error', message });
        },
      ).catch((error) => {
          console.error('Game stream maintenance failed:', error);
      });
    },  abortController.signal,
        (message) => {
          send(socket, { type: 'error', message });
    }).catch((error) => {
      console.error('Event stream maintenance failed:', error);
    });

    socket.on('message', (rawMessage) => {
      const currentToken = getAccessToken(request);
      const currentSessionKey = getSessionKey(request);
      if (!currentToken || !currentSessionKey) {
        send(socket, { type: 'error', message: 'Session expired. Please log in again.' });
        socket.close(1008, 'Session expired');
        return;
      }
      accessToken = currentToken;
      sessionKey = currentSessionKey;
      
      const now = Date.now();
      if (now - commandWindowStartedAt >= 10_000) {
        commandWindowStartedAt = now;
        commandCount = 0;
      }
      if (++commandCount > 30) {
        send(socket, { type: 'error', message: 'Too many game commands' });
        return;
      }

      commandQueue = commandQueue.then(async () => {
        const commandController = new AbortController();
        const commandTimeout = setTimeout(
          () => commandController.abort(),
          COMMAND_TIMEOUT_MS,
        );
        commandTimeout.unref?.();
        let message;

        try {
          message = JSON.parse(rawMessage.toString());

          if (message.type === 'matchmaking.start') {
            if (
              typeof message.attemptId !== 'string' ||
              !/^[a-zA-Z0-9_-]{16,128}$/.test(message.attemptId)
            ) {
              send(socket, {
                type: 'error',
                scope: 'matchmaking',
                message: 'Invalid matchmaking attempt',
              });
              return;
            }

            if (gameId) {
              send(socket, {
                type: 'error',
                scope: 'matchmaking',
                message: 'A game is already in progress',
              });
              return;
            }

            awaitingMatchAttemptId = message.attemptId;
            return;
          }

          if (message.type === 'matchmaking.cancel') {
            if (message.attemptId === awaitingMatchAttemptId) {
              cancelLichessSeek(sessionKey, message.attemptId);
              awaitingMatchAttemptId = null;
            }
            return;
          }
          if (message.type === 'game.resume') {
            if (!gameId && !awaitingMatchAttemptId) {
              resumable = true;
            }
            return;
          }

          if (message.type === 'game.resign') {
            if (message.gameId !== gameId) {
              send(socket, { type: 'error', message: 'Invalid game ID' });
              return;
            }

            const resignResponse = await resignLichessGame(
              accessToken,
              gameId,
              commandController.signal,
            );
            if (!resignResponse.ok) {
              send(socket, {
                type: 'error',
                message: `Lichess rejected resignation: ${await responseError(resignResponse)}`,
              });
            }
            return;
          }

          if (message.type === 'game.takeback') {
            if (
              message.gameId !== gameId ||
              !['offer', 'accept', 'decline'].includes(message.action)
            ) {
              send(socket, { type: 'error', message: 'Invalid takeback request' });
              return;
            }

            const takebackResponse = await handleLichessTakeback(
              accessToken,
              gameId,
              message.action,
              commandController.signal,
            );

            send(socket, {
              type: 'game.takeback.result',
              ok: takebackResponse.ok,
              action: message.action,
              message: takebackResponse.ok
                ? undefined
                : `Lichess rejected the takeback: ${await responseError(takebackResponse)}`,
            });

            if (!takebackResponse.ok) {
              send(socket, {
                type: 'error',
                scope: 'takeback',
                message: 'Takeback request was rejected',
              });
            }
            return;
          }

          if (message.type === 'game.draw') {
            if (message.gameId !== gameId || typeof message.accept !== 'boolean') {
              send(socket, { type: 'error', message: 'Invalid draw request' });
              return;
            }

            const drawResponse = await handleLichessDraw(
              accessToken,
              gameId,
              message.accept ? 'yes' : 'no',
              commandController.signal,
            );
            send(socket, {
              type: 'game.draw.result',
              ok: drawResponse.ok,
              accept: message.accept,
              message: drawResponse.ok
                ? undefined
                : `Lichess rejected the draw request: ${await responseError(drawResponse)}`,
            });
            if (!drawResponse.ok) {
              send(socket, {
                type: 'error',
                message: 'Draw request was rejected',
              });
            }
            return;
          }

          if (message.type === 'game.claimVictory') {
            if (message.gameId !== gameId) {
              send(socket, { type: 'error', message: 'Invalid game ID' });
              return;
            }

            const claimResponse = await claimLichessVictory(
              accessToken,
              gameId,
              commandController.signal,
            );
            send(socket, {
              type: 'game.claimVictory.result',
              ok: claimResponse.ok,
              message: claimResponse.ok
                ? undefined
                : `Lichess rejected the claim: ${await responseError(claimResponse)}`,
            });
            return;
          }

          if (message.type === 'game.chat') {
            if (
              message.gameId !== gameId ||
              !['player', 'spectator'].includes(message.room) ||
              typeof message.text !== 'string' ||
              !message.text.trim() ||
              message.text.length > 140
            ) {
              send(socket, { type: 'error', scope: 'chat', message: 'Invalid chat message' });
              return;
            }

            const chatResponse = await sendLichessChat(
              accessToken,
              gameId,
              message.room,
              message.text.trim(),
              commandController.signal,
            );
            if (chatResponse.ok) {
              send(socket, {
                type: 'game.chat.sent',
                room: message.room,
                text: message.text.trim(),
              });
            } else {
              send(socket, {
                type: 'error',
                scope: 'chat',
                message: `Lichess rejected the chat message: ${await responseError(chatResponse)}`,
              });
            }
            return;
          }

          if (
            message.type !== 'game.move' ||
            message.gameId !== gameId ||
            !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(message.uci)
          ) {
            send(socket, { type: 'error', scope: 'game.move', message: 'Invalid game move' });
            return;
          }

          const moveResponse = await sendLichessMove(
            accessToken,
            gameId,
            message.uci,
            commandController.signal,
          );

          if (!moveResponse.ok) {
            send(socket, {
              type: 'error',
              scope: 'game.move',
              message: `Lichess rejected the move: ${await responseError(moveResponse)}`,
            });
          }
        } catch {
          if (commandController.signal.aborted) {
            if (message?.type === 'game.takeback') {
              send(socket, {
                type: 'game.takeback.result',
                ok: false,
                action: message.action,
                message: 'Lichess request timed out',
              });
            } else if (message?.type === 'game.draw') {
              send(socket, {
                type: 'game.draw.result',
                ok: false,
                accept: message.accept,
                message: 'Lichess request timed out',
              });
            } else if (message?.type === 'game.claimVictory') {
              send(socket, {
                type: 'game.claimVictory.result',
                ok: false,
                message: 'Lichess request timed out',
              });
            } else {
              send(socket, {
                type: 'error',
                scope:
                  message?.type === 'game.move'
                    ? 'game.move'
                    : message?.type === 'game.chat'
                      ? 'chat'
                      : undefined,
                message: 'Lichess request timed out',
              });
            }
          } else {
            send(socket, { type: 'error', message: 'Invalid message' });
          }
        } finally {
          clearTimeout(commandTimeout);
        }
      }).catch(() => {
        send(socket, { type: 'error', message: 'Unable to process game command' });
      });
    });

    socket.on('close', () => {
      if (awaitingMatchAttemptId) {
        cancelLichessSeek(sessionKey, awaitingMatchAttemptId);
      }
      abortController.abort();
      gameStreamController?.abort();
    });
  });

  return webSocketServer;
}