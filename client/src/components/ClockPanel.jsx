import PieceVisual from './PieceVisual';

function formatClock(milliseconds) {
  const seconds = Math.max(0, milliseconds) / 1000;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds - minutes * 60;

  return minutes > 0
    ? `${minutes}:${Math.floor(remainingSeconds).toString().padStart(2, '0')}`
    : remainingSeconds.toFixed(1).padStart(4, '0');
}

export default function ClockPanel({
  whiteTime,
  blackTime,
  turn,
  capturedPieces,
  getSkinFolderForColor,
}) {
  return (
    <div className="clock-panel" aria-label="Time remaining">
      <div
        className={`clock-card ${turn === 'w' ? 'active' : ''} ${
          whiteTime < 30000 ? 'low-time' : ''
        }`}
      >
        <span className="clock-player">White</span>

        <strong>{formatClock(whiteTime)}</strong>

        <div className="capture-group">
          <div className="capture-pieces">
            {capturedPieces.b.map((piece, index) => (
              <span
                className="captured-piece"
                key={`${piece}-${index}`}
              >
                <PieceVisual
                  color="b"
                  type={piece}
                  skinFolder={getSkinFolderForColor('b')}
                />
              </span>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`clock-card ${turn === 'b' ? 'active' : ''} ${
          blackTime < 30000 ? 'low-time' : ''
        }`}
      >
        <span className="clock-player">Black</span>

        <strong>{formatClock(blackTime)}</strong>

        <div className="capture-group">
          <div className="capture-pieces">
            {capturedPieces.w.map((piece, index) => (
              <span
                className="captured-piece"
                key={`${piece}-${index}`}
              >
                <PieceVisual
                  color="w"
                  type={piece}
                  skinFolder={getSkinFolderForColor('w')}
                />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}