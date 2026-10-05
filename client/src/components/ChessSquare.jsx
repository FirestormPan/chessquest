import PieceVisual from './PieceVisual';

export default function ChessSquare({
  square,
  piece,
  isDark,
  isSelected,
  isLegalMove,
  draggingSquare,
  onSquareClick,
  onPieceClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  isLastMove,
  skinFolder,
  isChecked,
  isPremove,
}) {
  return (
    <button
      className={`square ${isDark ? 'dark' : 'light'} ${
        isSelected ? 'selected' : ''
      } ${isLegalMove ? 'legal-move' : ''} ${
        isLastMove ? 'last-move' : ''
      } ${isChecked ? 'in-check' : ''} ${
        isPremove ? 'premove' : ''
      } ${piece ? 'occupied' : ''}`}
      type="button"
      role="gridcell"
      data-square={square}
      aria-label={`${square}${
        piece
          ? `, ${piece.color === 'w' ? 'white' : 'black'} piece`
          : ''
      }${isLegalMove ? ', legal destination' : ''}`}
      onClick={() => onSquareClick(square)}
    >
      {piece && (
        <span
          className={`piece ${
            draggingSquare === square ? 'is-dragging' : ''
          }`}
          onClick={(event) => onPieceClick(event, square)}
          onPointerDown={(event) => onPointerDown(event, square)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <PieceVisual
            color={piece.color}
            type={piece.type}
            skinFolder={skinFolder}
          />
        </span>
      )}
    </button>
  );
}