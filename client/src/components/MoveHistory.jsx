export default function MoveHistory({ moveHistory, reviewPly, onSelectPly }) {
  if (moveHistory.length === 0) {
    return <p className="chat-empty">No moves yet.</p>;
  }

  return (
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
                className={`history-move ${isWhiteCurrent ? 'current' : ''}`}
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
                    className={`history-move ${isBlackCurrent ? 'current' : ''}`}
                    onClick={() =>
                      onSelectPly(
                        reviewPly === row.blackPly ? null : row.blackPly,
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
  );
}