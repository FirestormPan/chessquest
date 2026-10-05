import PieceVisual from './PieceVisual';
import ChessSquare from './ChessSquare';

function getSquarePosition(square, boardFiles, boardRanks) {
  const fileIndex = boardFiles.indexOf(square[0]);
  const rankIndex = boardRanks.indexOf(Number(square[1]));

  return {
    left: `${fileIndex * 12.5}%`,
    top: `${rankIndex * 12.5}%`,
  };
}

function squareToArrowPoint(square, boardFiles, boardRanks) {
  const fileIndex = boardFiles.indexOf(square[0]);
  const rankIndex = boardRanks.indexOf(Number(square[1]));
  return { x: fileIndex + 0.5, y: rankIndex + 0.5 };
}

function trimArrowEnd(from, to, trim) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return to;
  return {
    x: to.x - (dx / len) * trim,
    y: to.y - (dy / len) * trim,
  };
}

export default function ChessBoard({
  game,
  boardFiles,
  boardRanks,
  selectedSquare,
  lastMove,
  legalMoves,
  draggingSquare,
  onSquareClick,
  onPieceClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onBoardClick,
  moveAnimation,
  onMoveAnimationEnd,
  skinFolder,
  playerColor,
  opponentSkinFolder,
  checkedSquare,
  premoveSquares,
  arrows,
  arrowDrag,
  onArrowPointerDown,
  onArrowPointerMove,
  onArrowPointerUp,
  onArrowPointerCancel,
}) {
  const skinColor = playerColor ?? 'w';

  function renderArrow(arrow, key, opacity = 1) {
    const start = squareToArrowPoint(arrow.from, boardFiles, boardRanks);
    const end = squareToArrowPoint(arrow.to, boardFiles, boardRanks);
    const trimmedEnd = trimArrowEnd(start, end, 0.15);

    return (
      <line
        key={key}
        x1={start.x}
        y1={start.y}
        x2={trimmedEnd.x}
        y2={trimmedEnd.y}
        stroke="rgba(255, 170, 0, 0.9)"
        strokeWidth="0.14"
        strokeLinecap="round"
        markerEnd="url(#arrowhead)"
        opacity={opacity}
      />
    );
  }

  return (
    <div
      className="board"
      role="grid"
      aria-label="Interactive chessboard"
      onClick={onBoardClick}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={onArrowPointerDown}
      onPointerMove={onArrowPointerMove}
      onPointerUp={onArrowPointerUp}
      onPointerCancel={onArrowPointerCancel}
    >
      {boardRanks.flatMap((rank, rankIndex) =>
        boardFiles.map((file, fileIndex) => {
          const square = `${file}${rank}`;
          const piece = game.get(square);
          const displayedPiece =
            moveAnimation?.to === square ? null : piece;

          const isDark = (rankIndex + fileIndex) % 2 === 1;

          const isLastMove =
            lastMove?.from === square || lastMove?.to === square;

          const isChecked = checkedSquare === square;

          return (
            <ChessSquare
              key={square}
              square={square}
              piece={displayedPiece}
              isDark={isDark}
              isSelected={selectedSquare === square}
              isLegalMove={legalMoves.includes(square)}
              draggingSquare={draggingSquare}
              onSquareClick={onSquareClick}
              onPieceClick={onPieceClick}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              isLastMove={isLastMove}
              isChecked={isChecked}
              isPremove={premoveSquares.has(square)}
              skinFolder={
                piece?.color === skinColor ? skinFolder : opponentSkinFolder
              }
            />
          );
        }),
      )}

      {moveAnimation && (
        <div
          className="move-animation"
          style={getSquarePosition(
            moveAnimation.phase === 'destination'
              ? moveAnimation.to
              : moveAnimation.from,
            boardFiles,
            boardRanks,
          )}
          onTransitionEnd={onMoveAnimationEnd}
          aria-hidden="true"
        >
          <PieceVisual
            color={moveAnimation.piece.color}
            type={moveAnimation.piece.type}
            skinFolder={
              moveAnimation.piece.color === skinColor
                ? skinFolder
                : opponentSkinFolder
            }
          />
        </div>
      )}

      <svg
        className="arrow-layer"
        viewBox="0 0 8 8"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <marker
            id="arrowhead"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path
              d="M0,0 L10,5 L0,10 z"
              fill="rgba(255, 170, 0, 0.9)"
            />
          </marker>
        </defs>

        {arrows.map((arrow, index) =>
          renderArrow(arrow, `${arrow.from}-${arrow.to}-${index}`),
        )}

        {arrowDrag &&
          arrowDrag.from !== arrowDrag.to &&
          renderArrow(arrowDrag, 'drag-preview', 0.6)}
      </svg>
    </div>
  );
}