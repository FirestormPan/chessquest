import { useState } from 'react';

const pieceSymbols = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

const pieceNames = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export default function PieceVisual({ color, type, skinFolder, className = '' }) {
  const [failedImagePath, setFailedImagePath] = useState(null);

  if (!skinFolder) {
    return (
      <span className={className}>
        {pieceSymbols[color][type]}
      </span>
    );
  }

  const imagePath = `/${skinFolder}/${pieceNames[type]}.png`;
  const hasImage = failedImagePath !== imagePath;

  return hasImage ? (
    <img
      className={`piece-image ${className}`}
      src={imagePath}
      alt=""
      draggable="false"
      onError={() => setFailedImagePath(imagePath)}
    />
  ) : (
    <span className={className}>
      {pieceSymbols[color][type]}
    </span>
  );
}