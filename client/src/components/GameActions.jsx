export default function GameActions({
  socketReady,
  matchmaking,
  cancellingMatchmaking,
  gameId,
  onPlay,
  onCancel,

  drawOffer,
  drawPending,
  onDraw,

  onResign,

  canClaimVictory,
  opponentGone,
  gameStatus,
  claimPending,
  claimWinInSeconds,
  onClaimVictory,
  takebackOffer,
  takebackPending,
  gameRated,
  onTakeback,
}) {
  return (
    <div className="game-actions" aria-label="Game actions">
      {!gameId && (
        <button
          className="account-button"
          type="button"
          onClick={matchmaking ? onCancel : onPlay}
          disabled={
            !socketReady ||
            cancellingMatchmaking
          }
        >
          {!socketReady
            ? 'Connect to play'
            : cancellingMatchmaking
              ? 'Cancelling...'
              : matchmaking
                ? 'Cancel'
                : 'Play'}
        </button>
      )}

      {gameId && (
        <>
          <button className="account-button" type="button" onClick={onDraw}>
            {drawOffer ? 'Accept draw' : drawPending ? 'Cancel draw offer' : 'Offer draw'}
          </button>

          {!gameRated && (
            <>
              {takebackOffer ? (
                <>
                  <button
                    className="account-button"
                    type="button"
                    onClick={() => onTakeback('accept')}
                  >
                    Accept takeback
                  </button>
                  <button
                    className="account-button secondary"
                    type="button"
                    onClick={() => onTakeback('decline')}
                  >
                    Decline takeback
                  </button>
                </>
              ) : (
                <button
                  className="account-button"
                  type="button"
                  onClick={() => onTakeback('offer')}
                  disabled={takebackPending}
                >
                  {takebackPending ? 'Takeback offered' : 'Offer takeback'}
                </button>
              )}
            </>
          )}

          <button className="account-button danger" type="button" onClick={onResign}>
            Resign
          </button>

          {canClaimVictory &&
            opponentGone &&
            gameStatus === 'started' && (
              <button
                className="account-button"
                type="button"
                onClick={onClaimVictory}
                disabled={claimPending || claimWinInSeconds > 0}
              >
                {claimPending
                  ? 'Claiming…'
                  : claimWinInSeconds > 0
                    ? `Claim victory in ${claimWinInSeconds}s`
                    : 'Claim victory'}
              </button>
            )}
        </>
      )}
    </div>
  );
}