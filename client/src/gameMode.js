export const GAME_MODE = Object.freeze({
  LOCAL: 'local',
  LICHESS: 'lichess',
  BOT: 'bot',
});

export function canPlayerMove(mode, { piece, playerColor, turn }) {
  if (mode === GAME_MODE.LOCAL) return Boolean(piece);

  return Boolean(
    piece
    && playerColor
    && piece.color === playerColor
    && turn === playerColor,
  );
}


export const GAME_PHASE = {
  IDLE: 'idle',
  SEARCHING: 'searching',
  PLAYING: 'playing',
};

export function getCapabilities(mode) {
  const isLichess = mode === GAME_MODE.LICHESS;
  const isBot     = mode === GAME_MODE.BOT;
  const isLocal   = mode === GAME_MODE.LOCAL;

  return Object.freeze({
    // Human plays a fixed color (not "whoever is to move").
    assignedColor: isLichess || isBot,

    // Moves travel over the WebSocket and are confirmed by the server.
    remoteMoves: isLichess,

    // Moves are applied directly to the local chess.js instance.
    localMoves: isLocal || isBot,

    // Premove UI and logic are active.
    premoves: isLichess,

    // Show clocks and enforce time forfeit.
    clocks: isLichess,

    // Matchmaking / cancel flow.
    matchmaking: isLichess,

    // Chat panel is interactive.
    chat: isLichess,

    // Offer / accept draw.
    draw: isLichess,

    // Resign button.
    resign: isLichess || isBot,

    // Lichess "opponent gone, claim victory".
    claimVictory: isLichess,
  });
}