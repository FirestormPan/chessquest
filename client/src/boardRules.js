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

function getCheckedKingSquare(fen) {
  const position = new Chess(fen);
  if (!position.inCheck()) return null;

  const turnColor = position.turn();
  const board = position.board();

  for (const row of board) {
    for (const square of row) {
      if (square?.type === 'k' && square.color === turnColor) {
        return square.square;
      }
    }
  }

  return null;
}

function setFenTurn(fen, color) {
  const fields = fen.split(' ');
  fields[1] = color;
  return fields.join(' ');
}

function getPremoveMovesForPiece(fen, square, color) {
  const baseFen = setFenTurn(fen, color);
  const position = new Chess(baseFen);
  const piece = position.get(square);

  if (!piece || piece.color !== color) {
    return [];
  }

  const results = position.moves({ square, verbose: true });
  const seen = new Set(
    results.map((m) => `${m.to}${m.promotion ?? ''}`),
  );

  const enemyColor = color === 'w' ? 'b' : 'w';
  const rank = Number(square[1]);
  const fileIndex = 'abcdefgh'.indexOf(square[0]);

  // --- 1. Recapture premoves: destination currently holds our own piece ---
  for (const row of position.board()) {
    for (const dest of row) {
      if (!dest || dest.color !== color) continue;

      const destSquare = dest.square;
      const key = destSquare;
      if (seen.has(key)) continue;

      const simulated = new Chess(baseFen);
      const movingPiece = simulated.get(square);
      if (!movingPiece || movingPiece.color !== color) continue;

      simulated.remove(destSquare);

      // Pawn diagonal capture: chess.js needs an enemy piece
      // on the destination to generate the capture.
      const isPawn = movingPiece.type === 'p';
      const fileDiff = Math.abs(
        'abcdefgh'.indexOf(destSquare[0]) - fileIndex,
      );
      const rankDiff = Number(destSquare[1]) - rank;
      const forward = color === 'w' ? 1 : -1;

      if (
        isPawn &&
        fileDiff === 1 &&
        rankDiff === forward
      ) {
        simulated.put(
          { type: 'p', color: enemyColor },
          destSquare,
        );
      }

      try {
        const candidate = simulated
          .moves({ square, verbose: true })
          .find((m) => m.to === destSquare);

        if (candidate) {
          results.push(candidate);
          seen.add(key);
        }
      } catch {
        // ignore
      }
    }
  }

  // --- 2. Speculative en passant premoves ---
  // Our pawn on rank 5 (white) / rank 4 (black) may capture en passant
  // if the opponent double-pushes a pawn past it.
  const epSourceRank = color === 'w' ? 5 : 4;
  if (piece.type === 'p' && rank === epSourceRank) {
    const forward = color === 'w' ? 1 : -1;

    for (const df of [-1, 1]) {
      const file = fileIndex + df;
      if (file < 0 || file > 7) continue;

      const toFile = 'abcdefgh'[file];
      const to = `${toFile}${rank + forward}`;
      const enemyPawnSquare = `${toFile}${rank - forward}`;
      const key = to;
      if (seen.has(key)) continue;

      // Build a simulated FEN where an enemy pawn just double-pushed
      // onto enemyPawnSquare, making `to` the en passant target.
      const simulated = new Chess(baseFen);
      // The target square must be empty for en passant.
      if (simulated.get(to)) continue;
      // Remove whatever's on the enemy-pawn square (shouldn't be our pawn).
      const occupant = simulated.get(enemyPawnSquare);
      if (occupant && occupant.color === color) continue;
      simulated.remove(enemyPawnSquare);
      simulated.put({ type: 'p', color: enemyColor }, enemyPawnSquare);

      const fields = simulated.fen().split(' ');
      fields[3] = to; // set en passant target
      const withEp = setFenTurn(fields.join(' '), color);

      try {
        const candidate = new Chess(withEp)
          .moves({ square, verbose: true })
          .find((m) => m.to === to);

        if (candidate) {
          results.push({ ...candidate, isEnPassant: true });
          seen.add(key);
        }
      } catch {
        // ignore
      }
    }
  }

  return results;
}

  function applyPremove(fen, move, color, allowOwnDestination = false) {
    try {
      const position = new Chess(setFenTurn(fen, color));

      const piece = position.get(move.from);
      if (!piece || piece.color !== color) return null;

      const destinationPiece = position.get(move.to);
      const enemyColor = color === 'w' ? 'b' : 'w';

      if (destinationPiece && destinationPiece.color === color) {
        if (!allowOwnDestination) return null;

        // Pawn diagonal recapture: chess.js requires an enemy piece
        // on the destination to generate the diagonal capture.
        const isPawn = piece.type === 'p';
        const fileDiff = Math.abs(
          'abcdefgh'.indexOf(move.to[0]) -
          'abcdefgh'.indexOf(move.from[0]),
        );

        position.remove(move.to);

        if (isPawn && fileDiff === 1) {
          position.put(
            { type: 'p', color: enemyColor },
            move.to,
          );
        }
      }

      const promotion =
        move.promotion && 'qrbn'.includes(move.promotion)
          ? move.promotion
          : undefined;

      position.move({
        from: move.from,
        to: move.to,
        promotion,
      });

      let nextFen = position.fen();
      nextFen = clearFenEnPassant(nextFen);
      nextFen = setFenTurn(nextFen, color);
      return nextFen;
    } catch {
      return null;
    }
  }

  function validatePremoveSequence(fen, moves, color, allowOwnDestination = true) {
    let simulatedFen = fen;

    for (const move of moves) {
      const simulated = applyPremove(
        simulatedFen,
        move,
        color,
        allowOwnDestination,
      );

      if (!simulated) return false;
      simulatedFen = simulated;
    }

    return true;
  }


  function clearFenEnPassant(fen) {
    const fields = fen.split(' ');
    fields[3] = '-';
    return fields.join(' ');
  }

  function getPremovePosition(fen, moves, color) {
  let simulatedFen = fen;

  for (const move of moves) {
    const simulated = applyPremove(
      simulatedFen,
      move,
      color,
      true,
    );

    if (!simulated) return null;
    simulatedFen = simulated;
  }

  return simulatedFen;
}

export { normalizeFen, parseUciMoves, makeMoveFromUci, getLegalMovesForPiece, applyMoves, getCapturedPieces, getUciHistory, getMoveHistory,
   getCheckedKingSquare, setFenTurn, clearFenEnPassant, getPremoveMovesForPiece, applyPremove, validatePremoveSequence, getPremovePosition };