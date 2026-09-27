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
