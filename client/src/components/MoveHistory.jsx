export default function MoveHistory({
  moveHistory,
  reviewPly,
  onSelectPly,
  uciHistory,
  canStepBackward,
  canStepForward,
  onStepBackward,
  onStepForward,
  onReturnLive,
  isReviewing,
  showControls = false,
}) {
  return (
    <div className="move-history-wrapper">
      {showControls && uciHistory.length > 0 && (
        <div className="chat-header-actions">
          <button
            className="history-step-button"
            type="button"
            onClick={onStepBackward}
            disabled={!canStepBackward}
            aria-label="Previous move"
            title="Previous move"
          >
            ‹
          </button>

          <button
            className="history-step-button"
            type="button"
            onClick={onStepForward}
            disabled={!canStepForward}
            aria-label="Next move"
            title="Next move"
          >
            ›
          </button>

          <button
            className={`account-button secondary history-live-button ${
              isReviewing ? 'is-reviewing' : ''
            }`}
            type="button"
            onClick={onReturnLive}
            disabled={!isReviewing}
          >
            {isReviewing ? '⟲ Live' : '● Live'}
          </button>
        </div>
      )}

      {moveHistory.length === 0 ? (
        <p className="chat-empty">No moves yet.</p>
      ) : (
        <div className="move-history">
          {moveHistory
            .reduce((rows, move, index) => {
              if (move.color === 'w') {
                rows.push({
                  number: move.number,
                  white: move.san,
                  whitePly: index + 1,
                  black: '',
                  blackPly: null,
                });
              } else if (rows.length) {
                const last = rows[rows.length - 1];
                last.black = move.san;
                last.blackPly = index + 1;
              }
              return rows;
            }, [])
            .map((row) => {
              const isWhiteCurrent = reviewPly === row.whitePly;
              const isBlackCurrent =
                row.blackPly != null && reviewPly === row.blackPly;

              return (
                <div className="history-row" key={row.whitePly}>
                  <span>{row.number}. </span>
                  <button
                    type="button"
                    className={`history-move ${
                      isWhiteCurrent ? 'current' : ''
                    }`}
                    onClick={() =>
                      onSelectPly(
                        reviewPly === row.whitePly ? null : row.whitePly,
                      )
                    }
                  >
                    {row.white}
                  </button>
                  {row.blackPly != null && (
                    <>
                      <span> | </span>
                      <button
                        type="button"
                        className={`history-move ${
                          isBlackCurrent ? 'current' : ''
                        }`}
                        onClick={() =>
                          onSelectPly(
                            reviewPly === row.blackPly
                              ? null
                              : row.blackPly,
                          )
                        }
                      >
                        {row.black}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}