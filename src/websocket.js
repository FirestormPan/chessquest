import { WebSocket, WebSocketServer } from 'ws';

import {
  handleLichessDraw,
  isSeekCancelled,
  resignLichessGame,
  sendLichessChat,
  sendLichessMove,
  startLichessEventStream,
  startLichessGameStream,
  claimLichessVictory 
} from './game.js';

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
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

function logMove(event, details) {
  console.info(JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...details,
  }));
}

export function attachWebSocketServer(server, getAccessToken) {
  const webSocketServer = new WebSocketServer({ server, path: '/ws' });

  webSocketServer.on('connection', (socket, request) => {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      send(socket, { type: 'error', message: 'Lichess login required' });
      socket.close();
      return;
    }

    const abortController = new AbortController();
    let gameId = null;
    let gameStreamController = null;
    let receivedMoveCount = 0;

    startLichessEventStream(accessToken, (event) => {
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
      if (isSeekCancelled(accessToken)) return;

      gameId = event.game.gameId ?? event.game.id;
      if (!gameId) {
        send(socket, { type: 'error', message: 'Lichess game event did not include a game ID' });
        return;
      }
      send(socket, { type: 'game.found', gameId });
      gameStreamController = new AbortController();
      startLichessGameStream(accessToken, gameId, (gameEvent) => {
        if (gameEvent.type === 'gameFull') {
          receivedMoveCount = gameEvent.state.moves?.trim().split(/\s+/).filter(Boolean).length ?? 0;
        }
        if (gameEvent.type === 'gameState') {
          const moves = gameEvent.moves?.trim().split(/\s+/).filter(Boolean) ?? [];
          for (const move of moves.slice(receivedMoveCount)) {
            logMove('move.received', { source: 'lichess', gameId, uci: move });
          }
          receivedMoveCount = moves.length;
        }
        send(socket, { type: 'game.event', event: gameEvent });
        if (gameEvent.type === 'gameState' && gameEvent.status !== 'started') {
          gameStreamController?.abort();
          gameStreamController = null;
          gameId = null;
          receivedMoveCount = 0;
        }
      }, gameStreamController.signal).catch((error) => {
        if (error.name !== 'AbortError') send(socket, { type: 'error', message: error.message });
      });
    }, abortController.signal).catch((error) => {
      if (error.name !== 'AbortError') send(socket, { type: 'error', message: error.message });
    });

    socket.on('message', async (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString());

        if (message.type === 'game.resign') {
          if (message.gameId !== gameId) {
            send(socket, { type: 'error', message: 'Invalid game ID' });
            return;
          }

          const resignResponse = await resignLichessGame(accessToken, gameId);
          if (!resignResponse.ok) {
            send(socket, {
              type: 'error',
              message: `Lichess rejected resignation: ${await responseError(resignResponse)}`,
            });
          }
          return;
        }

        if (message.type === 'game.draw') {
          if (message.gameId !== gameId || typeof message.accept !== 'boolean') {
            send(socket, { type: 'error', message: 'Invalid draw request' });
            return;
          }

          const drawResponse = await handleLichessDraw(accessToken, gameId, message.accept);
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

          const claimResponse = await claimLichessVictory(accessToken, gameId);
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
            message.gameId !== gameId
            || !['player', 'spectator'].includes(message.room)
            || typeof message.text !== 'string'
            || !message.text.trim()
            || message.text.length > 140
          ) {
            send(socket, { type: 'error', scope: 'chat', message: 'Invalid chat message' });
            return;
          }

          const chatResponse = await sendLichessChat(
            accessToken,
            gameId,
            message.room,
            message.text.trim(),
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

        if (message.type !== 'game.move' || message.gameId !== gameId || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(message.uci)) {
          send(socket, { type: 'error', message: 'Invalid game move' });
          return;
        }

        logMove('move.made', { source: 'client', gameId, uci: message.uci });
        const moveResponse = await sendLichessMove(accessToken, gameId, message.uci);
        logMove(moveResponse.ok ? 'move.sent' : 'move.rejected', {
          destination: 'lichess',
          gameId,
          uci: message.uci,
          status: moveResponse.status,
        });
        if (!moveResponse.ok) {
          send(socket, {
            type: 'error',
            message: `Lichess rejected the move: ${await responseError(moveResponse)}`,
          });
        }
      } catch {
        send(socket, { type: 'error', message: 'Invalid message' });
      }
    });

    socket.on('close', () => {
      abortController.abort();
      gameStreamController?.abort();
    });
  });

  return webSocketServer;
}
