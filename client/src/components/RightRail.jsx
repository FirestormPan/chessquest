import { GAME_MODE, GAME_PHASE } from '../gameMode';
import TimeControlPicker from './TimeControlPicker';
import ClockPanel from './ClockPanel';
import MoveHistory from './MoveHistory';
import ChatBody from './ChatBody';
import GameActions from './GameActions';
import { BOT_STRENGTHS } from '../botEngine';
import PieceVisual from './PieceVisual';

export default function RightRail({
  view,
  gameMode,
  capabilities,
  phase,

  // clock / time-control
  clockSnapshot,
  whiteTime,
  blackTime,
  capturedPieces,
  getSkinFolderForColor,
  selectedTimeControl,
  setSelectedTimeControl,
  matchmaking,
  gameId,

  // bot
  botActive,
  botStrength = 1000,
  onBotStrengthChange,
  botPlayerColor,
  botColorMode = 'w',
  onBotColorModeChange,
  playerColor,
  gameStatus,
  onPlayBot,

  // skins
  skinFolders,
  selectedSkinFolder,
  selectedOpponentSkinFolder,
  selectingOpponentSkin,
  onToggleSelectingOpponent,
  onSelectSkinFolder,

  // actions
  socketReady,
  cancellingMatchmaking,
  premovesEnabled,
  onTogglePremoves,
  onPlay,
  onCancel,
  drawOffer,
  drawPending,
  onDraw,
  onResign,
  opponentGone,
  claimPending,
  claimWinInSeconds,
  onClaimVictory,

  // chat / history
  moveHistory,
  reviewPly,
  onSelectPly,
  chatMessages,
  chatText,
  chatError,
  onChatTextChange,
  onChatSubmit,
  chatMessagesRef,
  uciHistory,
  onToggleHistory,
  onStepBackward,
  onStepForward,
  onReturnLive,
  canStepBackward,
  canStepForward,
  isReviewing,
}) {
  if (view === 'hello') {
    return (
      <div className="skin-picker" aria-label="Choose a piece skin">
        <div className="skin-picker-heading">
          <span className="chat-kicker">Piece skins</span>
          <h2>Choose a set</h2>
          <label className="skin-opponent-toggle">
            <input
              type="checkbox"
              checked={selectingOpponentSkin}
              onChange={(event) =>
                onToggleSelectingOpponent(event.target.checked)
              }
            />
            Select for opponent
          </label>
        </div>

        <div className="skin-options">
          {skinFolders.map((folder) => (
            <button
              className={`skin-option ${
                selectedSkinFolder === folder
                  ? 'selected player-selected'
                  : ''
              } ${
                selectedOpponentSkinFolder === folder
                  ? 'selected opponent-selected'
                  : ''
              }`}
              key={folder}
              type="button"
              onClick={() => onSelectSkinFolder(folder)}
              disabled={
                selectingOpponentSkin
                  ? selectedSkinFolder === folder
                  : selectedOpponentSkinFolder === folder
              }
              aria-label={
                selectedSkinFolder === folder
                  ? `${folder} selected for player`
                  : selectedOpponentSkinFolder === folder
                    ? `${folder} selected for opponent`
                    : `Equip ${folder} piece skin`
              }
            >
              <img src={`/${folder}/king.png`} alt={`${folder} king skin`} />
              <span>{folder}</span>
            </button>
          ))}
        </div>

        {!skinFolders.length && (
          <p className="skin-empty">No piece skins found.</p>
        )}
      </div>
    );
  }

  if (view === 'bot') {
    return (
      <div className="bot-picker" aria-label="Play vs bot">
        <div className="bot-picker-heading">
          <span className="chat-kicker">Practice</span>
          <h2>Play vs Bot</h2>
        </div>

        <p className="bot-picker-description">
          Choose an estimated bot strength.
        </p>

        <fieldset className="bot-color-picker">
          <legend>Play as</legend>
          <div className="bot-color-options">
            <label
              className={botColorMode === 'w' ? 'is-selected' : ''}
              aria-label="Play as white"
            >
              <input
                type="radio"
                name="bot-color"
                value="w"
                checked={botColorMode === 'w'}
                onChange={() => onBotColorModeChange('w')}
              />
              <PieceVisual
                color="w"
                type="p"
                className="bot-color-piece"
              />
            </label>

            <label
              className={botColorMode === 'b' ? 'is-selected' : ''}
              aria-label="Play as black"
            >
              <input
                type="radio"
                name="bot-color"
                value="b"
                checked={botColorMode === 'b'}
                onChange={() => onBotColorModeChange('b')}
              />
              <PieceVisual
                color="b"
                type="p"
                className="bot-color-piece"
              />
            </label>

            <label
              className={botColorMode === 'random' ? 'is-selected' : ''}
              aria-label="Play as a random side"
            >
              <input
                type="radio"
                name="bot-color"
                value="random"
                checked={botColorMode === 'random'}
                onChange={() => onBotColorModeChange('random')}
              />
              <span className="bot-color-random-label">Random</span>
            </label>
          </div>
        </fieldset>

        <fieldset className="bot-strength-picker">
          <legend>Strength</legend>
          <div className="bot-strength-options">
            {BOT_STRENGTHS.map((strength) => (
              <label
                className={botStrength === strength ? 'is-selected' : ''}
                key={strength}
              >
                <input
                  type="radio"
                  name="bot-strength"
                  value={strength}
                  checked={botStrength === strength}
                  onChange={() => onBotStrengthChange(strength)}
                />
                <span>~{strength}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          className="account-button"
          type="button"
          onClick={onPlayBot}
          disabled={phase !== GAME_PHASE.IDLE}
        >
          Play vs Bot (~{botStrength})
        </button>
      </div>
    );
  }

  if (gameMode === GAME_MODE.BOT) {
    return (
      <>
        <div className="bot-game-info" aria-label="Bot game">
          <span className="chat-kicker">Practice</span>
          <h2>{botActive ? 'Playing vs Bot' : 'Bot game'}</h2>
          {botActive ? (
            <>
              <p>Estimated strength: ~{botStrength}</p>
              <p>You play: {playerColor === 'w' ? 'White' : 'Black'}</p>
            </>
          ) : (
            <p>{gameStatus || 'No bot game in progress.'}</p>
          )}
        </div>

        {botActive && (
          <div className="game-actions" aria-label="Bot game actions">
            <button
              className="account-button danger"
              type="button"
              onClick={onResign}
            >
              Resign
            </button>
          </div>
        )}

        <div className="chat-panel" aria-label="Move history">
          <div className="chat-header">
            <div>
              <span className="chat-kicker">Bot game</span>
              <h2>Move history</h2>
            </div>
          </div>
          <MoveHistory
            moveHistory={moveHistory}
            reviewPly={reviewPly}
            onSelectPly={onSelectPly}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {capabilities.clocks ? (
        clockSnapshot?.wtime != null &&
        clockSnapshot?.btime != null && (
          <ClockPanel
            whiteTime={whiteTime}
            blackTime={blackTime}
            turn={clockSnapshot.turn}
            capturedPieces={capturedPieces}
            getSkinFolderForColor={getSkinFolderForColor}
          />
        )
      ) : (
        <TimeControlPicker
          value={selectedTimeControl}
          onChange={setSelectedTimeControl}
          disabled={matchmaking || Boolean(gameId)}
        />
      )}

      {capabilities.premoves && (
        <label className="premove-toggle">
          <input
            type="checkbox"
            checked={premovesEnabled}
            onChange={(event) => onTogglePremoves(event.target.checked)}
          />
          <span>Enable premoves</span>
        </label>
      )}

      <GameActions
        socketReady={socketReady}
        matchmaking={matchmaking}
        cancellingMatchmaking={cancellingMatchmaking}
        gameId={gameId}
        onPlay={onPlay}
        onCancel={onCancel}
        drawOffer={drawOffer}
        drawPending={drawPending}
        onDraw={onDraw}
        onResign={onResign}
        canClaimVictory={capabilities.claimVictory}
        opponentGone={opponentGone}
        gameStatus={clockSnapshot?.status ?? ''}
        claimPending={claimPending}
        claimWinInSeconds={claimWinInSeconds}
        onClaimVictory={onClaimVictory}
      />

      <div className="chat-panel" aria-label="Game chat and move history">
        <div className="chat-header">
          <div>
            <span className="chat-kicker">Lichess</span>
            <h2>{view === 'history' ? 'Move history' : 'Game chat'}</h2>
          </div>
          <br />
          <div className="chat-header-actions">
            {view === 'history' && uciHistory.length > 0 && (
              <>
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
              </>
            )}

            <button
              className="account-button secondary"
              type="button"
              onClick={onToggleHistory}
              aria-pressed={view === 'history'}
            >
              {view === 'history' ? 'Chat' : 'History'}
            </button>
          </div>
        </div>

        {view === 'history' ? (
          <MoveHistory
            moveHistory={moveHistory}
            reviewPly={reviewPly}
            onSelectPly={onSelectPly}
          />
        ) : (
          <ChatBody
            messages={chatMessages}
            text={chatText}
            error={chatError}
            canChat={Boolean(gameId)}
            inputDisabled={!gameId || !socketReady}
            onChangeText={onChatTextChange}
            onSubmit={onChatSubmit}
            messagesRef={chatMessagesRef}
          />
        )}
      </div>
    </>
  );
}