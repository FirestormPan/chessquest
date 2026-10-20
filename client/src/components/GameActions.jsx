import { GAME_PHASE } from '../gameMode';

export default function GameActions({
  socketReady,
  cancellingMatchmaking,
  gameId,
  onPlay,
  onCancel,

  phase,
  
  drawOffer,
  drawPending,
  onDraw,

  onResign,
  confirmResign,
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
  const showClaimVictory = canClaimVictory && opponentGone && gameStatus === 'started';
  
  const showTakeback = !gameRated;

  return (
    <div className="game-actions" aria-label="Game actions">
      {!gameId && (
        <button
          className="account-button"
          onClick={phase === GAME_PHASE.SEARCHING ? onCancel : onPlay}
          disabled={!socketReady || cancellingMatchmaking}
        >
          {!socketReady
            ? 'Sign in to play'
            : cancellingMatchmaking
              ? 'Cancelling...'
              : phase === GAME_PHASE.SEARCHING
                ? 'Cancel'
                : 'Play'}
        </button>
      )}

      {gameId && (
        <>
          <button className="account-button" type="button" onClick={onDraw}>
            {drawOffer ? 'Accept draw' : drawPending ? 'Cancel draw offer' : 'Offer draw'}
          </button>

          {(showTakeback || showClaimVictory) && (
            <div className="game-actions-row">
              {showTakeback && (
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
                        Decline
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

              {showClaimVictory && (
                <button
                  className="account-button"
                  type="button"
                  onClick={onClaimVictory}
                  disabled={claimPending || claimWinInSeconds > 0}
                >
                  {claimPending
                    ? 'Claiming…'
                    : claimWinInSeconds > 0
                      ? `Claim in ${claimWinInSeconds}s`
                      : 'Claim victory'}
                </button>
              )}
            </div>
          )}

          <button className="account-button danger" type="button" onClick={onResign}>
            {confirmResign ? 'Sure?' : 'Resign'}
          </button>
        </>
      )}
    </div>
  );
}