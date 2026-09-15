import { Chess } from 'chess.js';


function normalizeFen(fen) {
  return fen === '-' || fen === 'startpos' ? undefined : fen;
}

function parseUciMoves(moves) {
  if (Array.isArray(moves)) {
    return moves.filter(Boolean);
  }

  return (moves ?? '').trim().split(/\s+/).filter(Boolean);
}

function makeMoveFromUci(uci) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4] || undefined,
  };
}

function getLegalMovesForPiece(fen, square) {
  const position = new Chess(fen);
  const piece = position.get(square);
  if (!piece) return [];

  if (piece.color === position.turn()) {
    return position.moves({ square, verbose: true });
  }

  const fields = fen.split(' ');
  fields[1] = piece.color;
  return new Chess(fields.join(' ')).moves({ square, verbose: true });
}

function applyMoves(initialFen, moves) {
  const nextGame = new Chess(normalizeFen(initialFen));

  for (const uci of parseUciMoves(moves)) {
    nextGame.move(makeMoveFromUci(uci));
  }

  return nextGame.fen();
}

function getCapturedPieces(initialFen, moves) {
  const nextGame = new Chess(normalizeFen(initialFen));
  const captured = { w: [], b: [] };

  for (const uci of parseUciMoves(moves)) {
    const move = nextGame.move(makeMoveFromUci(uci));
    if (move.captured) {
      captured[move.color === 'w' ? 'b' : 'w'].push(move.captured);
    }
  }

  return captured;
}

function getUciHistory(history) {
  return history.map((move) => `${move.from}${move.to}${move.promotion ?? ''}`);
}


function getMoveHistory(fen, moves) {
    const chess = new Chess(normalizeFen(fen));
    const history = [];

    for (const uci of parseUciMoves(moves)) {
        try {
        const move = chess.move(makeMoveFromUci(uci));

        history.push({
            number: Math.ceil(history.length / 2) + 1,
            color: move.color,
            san: move.san,
        });
        } catch {
        break;
        }
    }

    return history;
}

export { normalizeFen, parseUciMoves, makeMoveFromUci, getLegalMovesForPiece, applyMoves, getCapturedPieces, getUciHistory, getMoveHistory };