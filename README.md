# ChessQuest backend

Express and WebSocket backend foundation for the ChessQuest Lichess UI.

## Run

```powershell
npm install
npm run dev
```

HTTP health check: `GET http://localhost:3000/api/health`

Start Lichess login at `http://localhost:3000/api/auth/lichess`. The callback
uses `http://localhost:3000/api/auth/lichess/callback` and the authenticated
account is available from `GET /api/auth/me`.

The current prototype uses the `board:play` scope, PKCE, and stores access tokens in server memory. The Play button searches for a casual 10+5 Rapid game, which is supported by Lichess's Board API.
For production, use a persistent session store and HTTPS.

WebSocket endpoint: `ws://localhost:3000/ws`

Send a move as JSON:

```json
{"type":"game.move","from":"e2","to":"e4"}
```

The local practice bot bundles Stockfish.js 10.0.2 under GPL-3.0. Its upstream
source is https://github.com/niklasf/stockfish.js, and its license is included
at `client/bot-engine/LICENSE.txt`.


## Images
When adding a new skin, images should be square (n x n) and the edges of the png-image should be relatively close to the image depiction(actual content).