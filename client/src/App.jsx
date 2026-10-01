import { useEffect, useRef, useState, useMemo } from 'react';
import { Chess } from 'chess.js';
import {  parseUciMoves,  getLegalMovesForPiece,  applyMoves, applyPremove ,  getCapturedPieces,  getMoveHistory,  getCheckedKingSquare,  getPremoveMovesForPiece,  validatePremoveSequence, getPremovePosition,}   from './boardRules';
import { GAME_MODE, canPlayerMove } from './gameMode';
import {  TIME_CONTROL_CATEGORIES,   MATCHMAKING_CATEGORIES, isRatedAllowed,  formatTimeControl,} from './timeControls';

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const ranks = [8, 7, 6, 5, 4, 3, 2, 1];

const pieceSymbols = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

const promotionOptions = ['q', 'r', 'b', 'n'];

const promotionNames = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
};

const pieceNames = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const DOUBLE_CLICK_MS = 300;

function PieceVisual({ color, type, skinFolder, className = '' }) {
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


function formatClock(milliseconds) {
  const seconds = Math.max(0, milliseconds) / 1000;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds - minutes * 60;

  return minutes > 0
    ? `${minutes}:${Math.floor(remainingSeconds).toString().padStart(2, '0')}`
    : remainingSeconds.toFixed(1).padStart(4, '0');
}

function clockValue(value) {
  const milliseconds = Number(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function getPromotionLabel(pieceType) {
  return promotionNames[pieceType] ?? pieceType;
}

function ChessSquare({
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

function ChessBoard({
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

          const isDark =
            (rankIndex + fileIndex) % 2 === 1;

          const isLastMove =
            lastMove?.from === square ||
            lastMove?.to === square;

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
                piece?.color === skinColor
                  ? skinFolder
                  : opponentSkinFolder
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

function TimeControlPicker({ value, onChange, disabled = false }) {
  const { category, time, increment, rated } = value;

  const presets = TIME_CONTROL_CATEGORIES[category]?.presets ?? [];
  const ratedAllowed = isRatedAllowed(time);

  // Only render categories that the Board API accepts for open seeks.
  const availableCategories = MATCHMAKING_CATEGORIES.map(
    (key) => [key, TIME_CONTROL_CATEGORIES[key]],
  );

  function handleCategoryChange(event) {
    const nextCategory = event.target.value;
    const firstPreset = TIME_CONTROL_CATEGORIES[nextCategory].presets[0];

    onChange({
      category: nextCategory,
      time: firstPreset.time,
      increment: firstPreset.increment,
      rated: isRatedAllowed(firstPreset.time) ? rated : false,
    });
  }

  function handlePresetChange(event) {
    const index = Number(event.target.value);
    const preset = presets[index];

    if (!preset) return;

    onChange({
      ...value,
      time: preset.time,
      increment: preset.increment,
      rated: isRatedAllowed(preset.time) ? rated : false,
    });
  }

  const selectedPresetIndex = presets.findIndex(
    (preset) => preset.time === time && preset.increment === increment,
  );

  return (
    <div className="time-control-picker" aria-label="Time control">
      <div className="time-control-row">
        <label htmlFor="time-control-category">Time control</label>
        <select
          id="time-control-category"
          value={category}
          disabled={disabled}
          onChange={handleCategoryChange}
        >
          {availableCategories.map(([key, cat]) => (
            <option key={key} value={key}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      <div className="time-control-row">
        <label htmlFor="time-control-preset">Preset</label>
        <select
          id="time-control-preset"
          value={selectedPresetIndex === -1 ? 0 : selectedPresetIndex}
          disabled={disabled}
          onChange={handlePresetChange}
        >
          {presets.map((preset, index) => (
            <option key={`${preset.time}-${preset.increment}`} value={index}>
              {formatTimeControl(preset.time, preset.increment)}
            </option>
          ))}
        </select>
      </div>

      <label className="time-control-rated">
        <input
          type="checkbox"
          checked={rated}
          disabled={disabled || !ratedAllowed}
          onChange={(event) =>
            onChange({ ...value, rated: event.target.checked })
          }
        />
        <span>Rated</span>
      </label>

      {!ratedAllowed && (
        <p className="time-control-hint">
          Rated games are only available at Rapid (10+0) and slower.
        </p>
      )}
    </div>
  );
}


function App() {
  const socketRef = useRef(null);

  const initialFenRef = useRef(null);
  const fenRef = useRef(new Chess().fen());

  const playerColorRef = useRef(null);
  const gameIdRef = useRef(null);

  const moveCountRef = useRef(0);
  const lastClickRef = useRef({ square: null, time: 0 });
  const suppressPieceClickRef = useRef(false);
  const selectedSquareRef = useRef(null);

  const boardFrameRef = useRef(null);
  const animationTimerRef = useRef(null);

  const premoveQueueRef = useRef([]);
  const premoveSendingRef = useRef(false);

  const [fen, setFen] = useState(() => new Chess().fen());
  const [lastMove, setLastMove] = useState(null);
  const [moveAnimation, setMoveAnimation] = useState(null);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [draggingSquare, setDraggingSquare] = useState(null);
  const [pointerDrag, setPointerDrag] = useState(null);

  const [account, setAccount] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [gameId, setGameId] = useState(null);
  const [gameMode, setGameMode] = useState(GAME_MODE.LOCAL);
  const [matchmaking, setMatchmaking] = useState(false);
  const [cancellingMatchmaking, setCancellingMatchmaking] =
    useState(false);
  const [gameStatus, setGameStatus] = useState('');

  const [arrows, setArrows] = useState([]);
  const [arrowDrag, setArrowDrag] = useState(null);

  const [selectedTimeControl, setSelectedTimeControl] = useState(() => {
  const defaultCategory = 'rapid';
  const firstPreset = TIME_CONTROL_CATEGORIES[defaultCategory].presets[0];

    return {
      category: defaultCategory,
      time: firstPreset.time,
      increment: firstPreset.increment,
      rated: false,
    };
  });

  const [playerColor, setPlayerColor] = useState(null);
  const [socketReady, setSocketReady] = useState(false);

  const [capturedPieces, setCapturedPieces] = useState({
    w: [],
    b: [],
  });

  const [rightRailView, setRightRailView] = useState('game');

  const [skinFolders, setSkinFolders] = useState([]);
  const [selectedSkinFolder, setSelectedSkinFolder] =
    useState('alteon');
  const [selectedOpponentSkinFolder, setSelectedOpponentSkinFolder] =
    useState('evil');
  const [selectingOpponentSkin, setSelectingOpponentSkin] =
    useState(false);

  const [clockSnapshot, setClockSnapshot] = useState(null);
  const [clockNow, setClockNow] = useState(() => Date.now());

  const [promotionChoice, setPromotionChoice] = useState(null);
  const [promotionPopupStyle, setPromotionPopupStyle] = useState({
    left: 0,
    top: 0,
  });

  const [drawOffer, setDrawOffer] = useState(false);
  const [drawPending, setDrawPending] = useState(false);
  const drawPendingRef = useRef(false);

  const [opponentGone, setOpponentGone] = useState(false);
  const [claimWinInSeconds, setClaimWinInSeconds] = useState(null);
  const [claimPending, setClaimPending] = useState(false);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [chatError, setChatError] = useState('');
  const chatMessagesRef = useRef(null);

  const [moveHistory, setMoveHistory] = useState([]);
  const [uciHistory, setUciHistory] = useState([]);

  const [premoveQueue, setPremoveQueue] = useState([]);
  const [premovesEnabled, setPremovesEnabled] = useState(true);

  const [reviewPly, setReviewPly] = useState(null);
  const totalPlies = uciHistory.length;
  // reviewPly === null means "live" (== totalPlies)
  const effectivePly = reviewPly ?? totalPlies;
  const canStepBackward = effectivePly > 0;
  const canStepForward = effectivePly < totalPlies;

  const premoveSquares = useMemo(() => {
    const squares = new Set();

    for (const move of premoveQueue) {
      squares.add(move.from);
      squares.add(move.to);
    }

    return squares;
  }, [premoveQueue]);


  // for premove simulation
  const realGame = useMemo(() => new Chess(fen), [fen]);

  const displayFen = useMemo(() => {
    if (!premoveQueue.length || !playerColor) return fen;

    const simulated = getPremovePosition(
      fen,
      premoveQueue,
      playerColor,
    );

    return simulated ?? fen;
  }, [fen, premoveQueue, playerColor]);

  const reviewFen = useMemo(() => {
    if (reviewPly == null) return null;
    if (!initialFenRef.current) return null;

    try {
      return applyMoves(
        initialFenRef.current,
        uciHistory.slice(0, reviewPly),
      );
    } catch {
      return null;
    }
  }, [reviewPly, uciHistory]);

  const boardFen = reviewFen ?? displayFen;

  const game = useMemo(() => new Chess(boardFen), [boardFen]);

  const isLichessGame =
    gameMode === GAME_MODE.LICHESS;

  const checkedSquare = getCheckedKingSquare(boardFen);

  const isReviewing = reviewPly != null;

  const boardLastMove = useMemo(() => {
    if (reviewPly == null) return lastMove;

    const move = uciHistory[reviewPly - 1];
    if (!move) return null;

    return { from: move.slice(0, 2), to: move.slice(2, 4) };
  }, [reviewPly, uciHistory, lastMove]);


  const [rematchAvailable, setRematchAvailable] = useState(false);
  const [rematchChallenge, setRematchChallenge] = useState(null);

  const boardFiles = useMemo(
    () => (playerColor === 'b' ? [...files].reverse() : files),
    [playerColor],
  );

  const boardRanks = useMemo(
    () => (playerColor === 'b' ? [...ranks].reverse() : ranks),
    [playerColor],
  );

  const elapsed =
    clockSnapshot?.status === 'started'
      ? clockNow - clockSnapshot.updatedAt
      : 0;

  const whiteTime =
    clockSnapshot?.wtime == null
      ? 0
      : clockSnapshot.wtime -
        (clockSnapshot.turn === 'w' ? elapsed : 0);

  const blackTime =
    clockSnapshot?.btime == null
      ? 0
      : clockSnapshot.btime -
        (clockSnapshot.turn === 'b' ? elapsed : 0);

  function getSkinFolderForColor(color) {
    const skinColor = playerColor ?? 'w';

    return color === skinColor
      ? selectedSkinFolder
      : selectedOpponentSkinFolder;
  }

  function stepBackward() {
    if (!canStepBackward) return;
    const next = effectivePly - 1;
    setReviewPly(next === totalPlies ? null : next);
    clearSelection();
    closePromotionChoice();
  }

  function stepForward() {
    if (!canStepForward) return;
    const next = effectivePly + 1;
    setReviewPly(next === totalPlies ? null : next);
    clearSelection();
    closePromotionChoice();
  }

  function selectSkinFolder(folder) {
    if (selectingOpponentSkin) {
      if (selectedOpponentSkinFolder === folder) {
        setSelectedOpponentSkinFolder(null);
        return;
      }

      if (selectedSkinFolder === folder) return;

      setSelectedOpponentSkinFolder(folder);
      return;
    }

    if (selectedSkinFolder === folder) {
      setSelectedSkinFolder(null);
      return;
    }

    if (selectedOpponentSkinFolder === folder) return;

    setSelectedSkinFolder(folder);
  }

  function clearSelection() {
    selectedSquareRef.current = null;
    setSelectedSquare(null);
    setLegalMoves([]);
  }

  function animateMove(from, to, piece) {
    if (!piece) return;

    window.clearTimeout(animationTimerRef.current);

    setMoveAnimation({
      from,
      to,
      piece,
      phase: 'source',
    });

    window.requestAnimationFrame(() => {
      setMoveAnimation((current) =>
        current
          ? {
              ...current,
              phase: 'destination',
            }
          : null,
      );
    });

    animationTimerRef.current = window.setTimeout(
      () => setMoveAnimation(null),
      280,
    );
  }

  function finishMoveAnimation() {
    window.clearTimeout(animationTimerRef.current);
    setMoveAnimation(null);
  }

  function closePromotionChoice() {
    setPromotionChoice(null);
  }

  

  function clearPremoves() {
    premoveQueueRef.current = [];
    setPremoveQueue([]);
    premoveSendingRef.current = false;
  }

  function getAvailablePremoveMoves(square) {
  const color = playerColorRef.current;

  if (!isLichessGame || !color) {
    return [];
  }

  const simulatedFen = getPremovePosition(
    fenRef.current,
    premoveQueueRef.current,
    color,
  );

  if (!simulatedFen) {
    return [];
  }

  return getPremoveMovesForPiece(
    simulatedFen,
    square,
    color,
  );
}

  function selectSquare(square) {
  const piece = game.get(square);

  if (!piece) {
    clearSelection();
    return;
  }

  const color = isLichessGame
    ? playerColorRef.current
    : realGame.turn();

  if (!color || piece.color !== color) {
    clearSelection();
    return;
  }

  const isOurTurn =
    realGame.turn() === color;

  if (isOurTurn) {
    const moves = getLegalMovesForPiece(
      fenRef.current,
      square,
    );

    if (!moves.length) {
      clearSelection();
      return;
    }

    selectedSquareRef.current = square;
    setSelectedSquare(square);
    setLegalMoves(
      moves.map((move) => move.to),
    );

    return;
  }

  if (isLichessGame && premovesEnabled) {
    const moves = getAvailablePremoveMoves(square);

    if (!moves.length) {
      clearSelection();
      return;
    }

    selectedSquareRef.current = square;
    setSelectedSquare(square);
    setLegalMoves(
      moves.map((move) => move.to),
    );
  }
}
  


function reconcilePremoves(nextFen, newMoves) {
  let queue = premoveQueueRef.current;

  if (!queue.length) {
    return;
  }

  /*
   * Only remove the first premove after the server
   * has confirmed that exact UCI move.
   */
  if (premoveSendingRef.current) {
    const sentMove = queue[0];

    const sentUci =
      `${sentMove.from}${sentMove.to}${sentMove.promotion ?? ''}`;

    if (newMoves.includes(sentUci)) {
      queue = queue.slice(1);

      premoveQueueRef.current = queue;
      setPremoveQueue(queue);

      premoveSendingRef.current = false;
    }
  }

  queue = premoveQueueRef.current;

  if (!queue.length) {
    return;
  }

  const color = playerColorRef.current;

  if (!color) {
    clearPremoves();
    return;
  }

  // Drop leading premoves that are now impossible.
  // A recapture premove is only valid if the destination
  // no longer holds our own piece.
  while (queue.length) {
    const head = queue[0];
    const headGame = new Chess(nextFen);
    const dest = headGame.get(head.to);

    const ownDestination = dest && dest.color === color;

    // Validate the whole remaining sequence strictly.
    const valid = !ownDestination
      && validatePremoveSequence(nextFen, queue, color, false);

    if (valid) break;

    // If the head was a recapture that never happened,
    // drop the entire chain (chained premoves depended on it).
    // Otherwise just trim the tail.
    if (ownDestination) {
      queue = [];
      break;
    }

    queue = queue.slice(0, -1);
  }

  if (queue.length !== premoveQueueRef.current.length) {
    premoveQueueRef.current = queue;
    setPremoveQueue(queue);
  }

  if (!queue.length) return;

  const currentGame = new Chess(nextFen);
  if (
    currentGame.turn() === color &&
    !premoveSendingRef.current
  ) {
    window.setTimeout(() => tryExecuteNextPremove(), 0);
  }
}

  function handleResign() {
    const currentGameId = gameIdRef.current;

    if (
      !currentGameId ||
      socketRef.current?.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    if (!window.confirm('Resign this game?')) {
      return;
    }

    socketRef.current.send(
      JSON.stringify({
        type: 'game.resign',
        gameId: currentGameId,
      }),
    );

    setGameStatus('Resigning game...');
  }

  function handleDraw() {
    const currentGameId = gameIdRef.current;

    if (
      !currentGameId ||
      socketRef.current?.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    // Determine intent.
    const isAccepting = drawOffer;
    const isWithdrawing = drawPending && !drawOffer;
    const isOffering = !drawOffer && !drawPending;

    socketRef.current.send(
      JSON.stringify({
        type: 'game.draw',
        gameId: currentGameId,
        accept: isAccepting,
        // `withdraw` is a client hint; the backend treats
        // accept:false the same way for Lichess.
        withdraw: isWithdrawing,
      }),
    );

    if (isOffering || isWithdrawing) {
      drawPendingRef.current = isOffering;
      setDrawPending(isOffering);
    } else if (isAccepting) {
      setDrawOffer(false);
    }

    setGameStatus(
      isAccepting
        ? 'Accepting draw…'
        : isWithdrawing
          ? 'Draw offer withdrawn'
          : 'Draw offered',
    );
  }

  function handleChatSubmit(event) {
    event.preventDefault();

    const text = chatText.trim();
    const currentGameId = gameIdRef.current;

    if (
      !currentGameId ||
      !text ||
      text.length > 140 ||
      socketRef.current?.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    setChatError('');

    socketRef.current.send(
      JSON.stringify({
        type: 'game.chat',
        gameId: currentGameId,
        room: 'player',
        text,
      }),
    );

    setChatText('');
  }

  useEffect(() => {
    premoveQueueRef.current = premoveQueue;
  }, [premoveQueue]);

  useEffect(() => {
    if (selectedTimeControl.rated && !isRatedAllowed(selectedTimeControl.time)) {
      setSelectedTimeControl((current) =>  current.rated ? { ...current, rated: false } : current )
    }
  }, [selectedTimeControl.rated, selectedTimeControl.time]);

  useEffect(() => {
    fetch('/api/auth/me', {
      credentials: 'include',
    })
      .then((response) =>
        response.ok ? response.json() : null,
      )
      .then((data) =>
        setAccount(data?.account ?? null),
      )
      .catch(() => setAccount(null))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/skins')
      .then((response) =>
        response.ok
          ? response.json()
          : { skins: [] },
      )
      .then((data) => {
        const folders = Array.isArray(data.skins)
          ? data.skins
          : [];

        setSkinFolders(folders);

        if (
          folders.length &&
          !folders.includes(selectedSkinFolder)
        ) {
          setSelectedSkinFolder(folders[0]);
        }
      })
      .catch(() => setSkinFolders([]));
  }, []);

  useEffect(() => {
    if (!premovesEnabled) {
      clearPremoves();
    }
  }, [premovesEnabled]);

  useEffect(() => {
    if (
      !clockSnapshot ||
      clockSnapshot.status !== 'started'
    ) {
      return undefined;
    }

    const interval = window.setInterval(
      () => setClockNow(Date.now()),
      100,
    );

    return () => window.clearInterval(interval);
  }, [clockSnapshot]);

  useEffect(() => {
    chatMessagesRef.current?.scrollTo({
      top: chatMessagesRef.current.scrollHeight,
    });
  }, [chatMessages]);

  useEffect(() => {
    function handleKeyDown(event) {
      // Ignore when the user is typing (chat input, etc.)
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Ignore when a modifier is held (Ctrl+Arrow etc.)
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      switch (event.key) {
        case 'ArrowLeft':
          if (!canStepBackward) return;
          event.preventDefault();
          stepBackward();
          break;

        case 'ArrowRight':
          if (!canStepForward) return;
          event.preventDefault();
          stepForward();
          break;

        case 'ArrowDown':
          if (totalPlies === 0) return;
          event.preventDefault();
          setReviewPly(0);
          clearSelection();
          closePromotionChoice();
          break;

        case 'ArrowUp':
          if (totalPlies === 0) return;
          event.preventDefault();
          setReviewPly(null);
          clearSelection();
          closePromotionChoice();
          break;

        default:
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    canStepBackward,
    canStepForward,
    totalPlies,
    stepBackward,
    stepForward,
  ]);

  useEffect(() => {
    if (
      !promotionChoice ||
      !boardFrameRef.current
    ) {
      return undefined;
    }

    const squareElement =
      boardFrameRef.current.querySelector(
        `[data-square="${promotionChoice.to}"]`,
      );

    if (!squareElement) {
      return undefined;
    }

    const squareRect =
      squareElement.getBoundingClientRect();

    setPromotionPopupStyle({
      left:
        squareRect.left +
        squareRect.width / 2,
      top:
        squareRect.top +
        squareRect.height / 2,
    });

    return undefined;
  }, [
    promotionChoice,
    boardFen,
    boardFiles,
    boardRanks,
  ]);

  useEffect(() => {
    if (!account) {
      setSocketReady(false);
      return undefined;
    }

    const protocol =
      window.location.protocol === 'https:'
        ? 'wss'
        : 'ws';

    const socket = new WebSocket(
      `${protocol}://${window.location.host}/ws`,
    );

    socketRef.current = socket;

    socket.onopen = () => {
      if (socketRef.current !== socket) return;

      setSocketReady(true);
      setGameStatus('Connected to game server');
    };

    socket.onmessage = (message) => {
      if (socketRef.current !== socket) return;

      let payload;

      try {
        payload = JSON.parse(message.data);
      } catch {
        setGameStatus(
          'Received an invalid message from the game server',
        );
        return;
      }

      if (payload.type === 'game.found') {
          gameIdRef.current = payload.gameId;
          setGameStatus('Opponent found, waiting for game details…');
          return;
      }

      if (payload.type === 'error') {
        if (payload.scope === 'chat') {
          setChatError(payload.message);
        }

        /*
         * A rejected game.move must release the premove
         * sending lock. Do not clear premoves for unrelated
         * errors such as chat/draw errors.
         */
        if (payload.scope === 'game.move') {
          clearPremoves();
        }

        if (
          payload.message === 'Draw request was rejected'
        ) {
          drawPendingRef.current = false;
          setDrawPending(false);
        }

        setMatchmaking(false);
        setGameStatus(payload.message);

        return;
      }

      if (payload.type === 'game.draw.result') {
        if (!payload.ok) {
          drawPendingRef.current = false;
          setDrawPending(false);

          setGameStatus(
            payload.message ??
              'Draw request was rejected',
          );
        }

        return;
      }

      if (payload.type === 'game.claimVictory.result') {
        if (!payload.ok) {
          setClaimPending(false);
          setGameStatus(
            payload.message ?? 'Claim was rejected by Lichess',
          );
        }
        // On success, wait for the follow-up gameState
        // (status: 'timeout') to end the game and reset state.
        return;
      }

      if (payload.type === 'game.chat.error') {
        setChatError(payload.message);
        return;
      }

      if (payload.type === 'game.chat.sent') {
        setChatMessages((current) => {
          const alreadyShown = current.some(
            (message) =>
              message.room === payload.room &&
              message.username ===
                account.username &&
              message.text === payload.text,
          );

          return alreadyShown
            ? current
            : [
                ...current,
                {
                  room: payload.room,
                  username: account.username,
                  text: payload.text,
                },
              ];
        });

        return;
      }

      if (payload.type !== 'game.event') {
        return;
      }

      const event = payload.event;

      if (event.type === 'opponentGone') {
        setOpponentGone(Boolean(event.gone));
        setClaimWinInSeconds(
          typeof event.claimWinInSeconds === 'number'
            ? event.claimWinInSeconds
            : null,
        );
        return;
      }
      if (event.type === 'chatLine') {
        setChatMessages((current) => {
          const alreadyShown = current.some(
            (message) =>
              message.room === event.room &&
              message.username === event.username &&
              message.text === event.text,
          );

          return alreadyShown
            ? current
            : [...current, event];
        });

        return;
      }

      if (event.type === 'gameFull') {
        const color =
          event.white?.id?.toLowerCase() ===
          account.username?.toLowerCase()
            ? 'w'
            : 'b';

        const nextFen = applyMoves(
          event.initialFen,
          event.state.moves,
        );

        const moves = parseUciMoves(
          event.state.moves,
        );

        const lastUciMove = moves[moves.length - 1];

        initialFenRef.current = event.initialFen;

        moveCountRef.current = moves.length;

        playerColorRef.current = color;
        setPlayerColor(color);


        gameIdRef.current = event.id;
        setGameId(event.id);

        setGameMode(GAME_MODE.LICHESS);
        setMatchmaking(false);  
        setGameStatus('Game in progress');

        setOpponentGone(false);
        setClaimWinInSeconds(null);
        setClaimPending(false);

        setMoveHistory(
          getMoveHistory(
            event.initialFen,
            event.state.moves,
          ),
        );

        setLastMove(
          lastUciMove
            ? {
                from: lastUciMove.slice(0, 2),
                to: lastUciMove.slice(2, 4),
              }
            : null,
        );

        setDrawOffer(false);
        drawPendingRef.current = false;
        setDrawPending(false);

        setChatMessages(
          Array.isArray(event.chat)
            ? event.chat
            : [],
        );

        setChatError('');

        fenRef.current = nextFen;
        setFen(nextFen);
        setReviewPly(null); 
        setUciHistory(moves);

        setArrows([]);

        setCapturedPieces(
          getCapturedPieces(
            event.initialFen,
            event.state.moves,
          ),
        );

        setClockSnapshot({
          wtime: clockValue(
            event.state.wtime,
          ),
          btime: clockValue(
            event.state.btime,
          ),
          winc:
            clockValue(
              event.clock?.increment,
            ) ?? 0,
          binc:
            clockValue(
              event.clock?.increment,
            ) ?? 0,
          turn: new Chess(nextFen).turn(),
          status: event.state.status,
          updatedAt: Date.now(),
        });

        return;
      }

      if (
        event.type === 'gameState' &&
        initialFenRef.current
      ) {
        const nextFen = applyMoves(
          initialFenRef.current,
          event.moves,
        );

        const moves = parseUciMoves(
          event.moves,
        );

        const lastUciMove = moves[moves.length - 1];

        const newMoves = moves.slice(
          moveCountRef.current,
        );

        const moveWasMade = newMoves.length > 0;

        moveCountRef.current = moves.length;

        const ownDrawOffer =
          playerColorRef.current === 'w' ? event.wdraw : event.bdraw;

        const opponentDrawOffer =
          playerColorRef.current === 'w' ? event.bdraw : event.wdraw;

        if (moveWasMade) {
          drawPendingRef.current = false;
          setDrawPending(false);
          setDrawOffer(false);
        } else {
          if (
            drawPendingRef.current &&
            !ownDrawOffer
          ) {
            drawPendingRef.current = false;
            setDrawPending(false);
            setGameStatus(
              'Draw offer refused',
            );
          }

          setDrawOffer(
            Boolean(opponentDrawOffer),
          );
          drawPendingRef.current = Boolean(ownDrawOffer);
          setDrawPending(Boolean(ownDrawOffer));
        }

        setMoveHistory(
          getMoveHistory(
            initialFenRef.current,
            event.moves,
          ),
        );

        setUciHistory(moves);

        setLastMove(
          lastUciMove
            ? {
                from: lastUciMove.slice(0, 2),
                to: lastUciMove.slice(2, 4),
              }
            : null,
        );

        if (newMoves.length) {
          setArrows([]);
          
          const newCapturedPieces =
            getCapturedPieces(
              fenRef.current,
              newMoves,
            );

          if (
            newCapturedPieces.w.length ||
            newCapturedPieces.b.length
          ) {
            setCapturedPieces((current) => ({
              w: [
                ...current.w,
                ...newCapturedPieces.w,
              ],
              b: [
                ...current.b,
                ...newCapturedPieces.b,
              ],
            }));
          }
        }

        /*
         * Update the authoritative position BEFORE
         * reconciling premoves.
         */
        fenRef.current = nextFen;
        setFen(nextFen);
        setReviewPly(null);
        /*
         * This is the important premove reconciliation
         * point. Every authoritative gameState is checked.
         */
        reconcilePremoves(
          nextFen,
          newMoves,
        );

        if (selectedSquareRef.current) {
          const updatedMoves =
            getLegalMovesForPiece(
              nextFen,
              selectedSquareRef.current,
            );

          if (updatedMoves.length > 0) {
            setLegalMoves(
              updatedMoves.map(
                (move) => move.to,
              ),
            );
          } else {
            clearSelection();
          }
        }

        setClockSnapshot((current) => ({
          ...current,
          wtime: clockValue(event.wtime),
          btime: clockValue(event.btime),
          turn: new Chess(nextFen).turn(),
          status: event.status,
          updatedAt: Date.now(),
        }));

        if (event.status !== 'started') {
          setGameStatus(
            `Game ${event.status}`,
          );

          fenRef.current = nextFen;
          setFen(nextFen);

          setOpponentGone(false);
          setClaimWinInSeconds(null);
          setClaimPending(false);

          gameIdRef.current = null;
          setGameId(null);

          moveCountRef.current = 0;
          setReviewPly(null);


          setGameMode(GAME_MODE.LOCAL);

          setArrows([]);
          clearSelection();
          clearPremoves();
        }
      }
    };

    socket.onerror = () => {
      if (socketRef.current === socket) {
        setGameStatus(
          'Game server connection failed',
        );
      }
    };

    socket.onclose = () => {
      if (socketRef.current !== socket) {
        return;
      }

      socketRef.current = null;
      setSocketReady(false);

      clearPremoves();

      setGameStatus(
        'Game server disconnected',
      );
    };

    return () => {
      setSocketReady(false);

      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      socket.close();
    };
  }, [account]);

  function handlePlay() {
    if (
      !socketReady ||
      socketRef.current?.readyState !== WebSocket.OPEN
    ) {
      setGameStatus('Game server is not connected');
      return;
    }

    const { time, increment, rated } = selectedTimeControl;

    if (rated && !isRatedAllowed(time)) {
      setGameStatus('Rated games require Rapid or slower.');
      return;
    }

    setMatchmaking(true);
    setGameStatus('Searching for an opponent...');

    fetch('/api/game/start', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time, increment, rated }),
    })
      .then((response) =>
        response.json().then((data) => ({ response, data })),
      )
      .then(({ response, data }) => {
        if (!response.ok) {
          throw new Error(data.error ?? 'Unable to start game search');
        }
        resetForNewGame();
      })
      .catch((error) => {
        setMatchmaking(false);
        setGameStatus(error.message);
      });
  }
  function resetForNewGame() {
    clearPremoves();

    const newGame = new Chess();
    fenRef.current = newGame.fen();
    setFen(fenRef.current);

    setCapturedPieces({ w: [], b: [] });
    setClockSnapshot(null);

    initialFenRef.current = null;
    playerColorRef.current = null;
    gameIdRef.current = null;
    moveCountRef.current = 0;

    drawPendingRef.current = false;

    setGameId(null);
    setGameMode(GAME_MODE.LOCAL);
    setPlayerColor(null);

    setLastMove(null);
    setDrawOffer(false);
    setDrawPending(false);

    setChatMessages([]);
    setChatText('');
    setChatError('');

    setArrows([]);

    setUciHistory([]);
    setMoveHistory([]);
    setReviewPly(null);

    clearSelection();
    closePromotionChoice();

    setOpponentGone(false);
    setClaimWinInSeconds(null);
    setClaimPending(false);
  }

  async function handleCancel() {
    setCancellingMatchmaking(true);

    try {
      const response = await fetch('/api/game/cancel',
        {
          method: 'POST',
          credentials: 'include',
        },
      );

      const data = response.status === 204 ? {} : await response.json();

      if (
        !response.ok &&
        response.status !== 404
      ) {
        throw new Error(
          data.error ?? 'Unable to cancel game search',
        );
      }
      // Even if the backend said 404, clear our local seek state.
      gameIdRef.current = null;
      setGameId(null);
      setMatchmaking(false);
      setGameStatus('Game search cancelled');
    } catch (error) {
      setGameStatus(error.message);
    } finally {
      setCancellingMatchmaking(false);
    }
  }

  function handleLogin() {
    window.location.assign(
      '/api/auth/lichess',
    );
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      clearPremoves();

      gameIdRef.current = null;
      initialFenRef.current = null;
      playerColorRef.current = null;

      setGameId(null);
      setPlayerColor(null);
      setGameMode(GAME_MODE.LOCAL);

      setOpponentGone(false);
      setClaimWinInSeconds(null);
      setClaimPending(false);

      setAccount(null);
    } catch {
      // Keep the UI responsive.
    }
  }

  function handleSquareClick(square) {
    if (isReviewing) return;
    if (promotionChoice) {
      closePromotionChoice();
      return;
    }

    if (shouldCancelPremovesOnClick(square)) return;


    if (selectedSquare) {
      if (square === selectedSquare) {
        clearSelection();
        return;
      }

      if (legalMoves.includes(square)) {
        const color = isLichessGame
          ? playerColorRef.current
          : realGame.turn();

        const isOurTurn =
          realGame.turn() === color;

        if (isOurTurn) {
          const selectedPiece =
            realGame.get(selectedSquare);

          if (!selectedPiece) {
            clearSelection();
            return;
          }

          if (isLichessGame && premovesEnabled) {
            const canMove = canPlayerMove(
              gameMode,
              {
                piece: selectedPiece,
                playerColor,
                turn: realGame.turn(),
              },
            );

            if (!canMove) {
              return;
            }
          }

          /*
          * A manual move takes precedence over
          * any unsent premove queue.
          */
          if (premoveQueueRef.current.length) {
            clearPremoves();
          }

          makeMove(
            selectedSquare,
            square,
          );

          return;
        }

        if (isLichessGame) {
          queueOrPromptPremove(
            selectedSquare,
            square,
          );
        }

        return;
      }
    }

    selectSquare(square);
  }

  function handlePieceClick(event, square) {
    if (isReviewing) return;

    event.stopPropagation();

    if (suppressPieceClickRef.current) {
      suppressPieceClickRef.current = false;
      return;
    }

    handleSquareClick(square);
  }

  function shouldCancelPremovesOnClick(square) {
    const now = Date.now();
    const last = lastClickRef.current;
    const isDoubleClick =
      last.square === square &&
      now - last.time < DOUBLE_CLICK_MS;

    lastClickRef.current = { square, time: now };

    if (isDoubleClick && premoveSquares.has(square)) {
      clearPremoves();
      clearSelection();
      return true;
    }
    return false;
  }


  function makeMove(
    from,
    to,
    promotion = '',
    shouldAnimate = true,
  ) {
    const currentFen = fenRef.current;
    const currentGame = new Chess(currentFen);
    const movingPiece = currentGame.get(from);

    if (!movingPiece) {
      return;
    }

    const shouldPromptPromotion =
      movingPiece.type === 'p' &&
      ['1', '8'].includes(to[1]) &&
      !promotion;

    if (shouldPromptPromotion) {
      setPromotionChoice({
        from,
        to,
        color: movingPiece.color,
        premove: false,
      });

      return;
    }

    if (isLichessGame) {
      if (
        !canPlayerMove(gameMode, {
          piece: movingPiece,
          playerColor,
          turn: currentGame.turn(),
        })
      ) {
        return;
      }

      const sent = sendOnlineMove(
        from,
        to,
        promotion,
      );

      if (!sent) {
        return;
      }

      clearPremoves();
      closePromotionChoice();
      clearSelection();

      return;
    }

    if (gameMode !== GAME_MODE.LOCAL) {
      return;
    }

    try {
      const playedMove = currentGame.move({
        from,
        to,
        promotion: promotion || undefined,
      });

      if (!playedMove) {
        clearSelection();
        return;
      }

      if (shouldAnimate) {
        animateMove(
          from,
          to,
          movingPiece,
        );
      }

      setLastMove({
        from: playedMove.from,
        to: playedMove.to,
      });

      const nextFen = currentGame.fen();

      fenRef.current = nextFen;
      setFen(nextFen);

      setArrows([]);

      if (playedMove.captured) {
        const capturedColor =
          playedMove.color === 'w'
            ? 'b'
            : 'w';

        setCapturedPieces((current) => ({
          ...current,
          [capturedColor]: [
            ...current[capturedColor],
            playedMove.captured,
          ],
        }));
      }

      closePromotionChoice();
      clearSelection();
    } catch {
      closePromotionChoice();
      clearSelection();
    }
  }


  function handleClaimVictory() {
    const currentGameId = gameIdRef.current;

    if (
      !currentGameId ||
      socketRef.current?.readyState !== WebSocket.OPEN ||
      claimPending
    ) {
      return;
    }

    setClaimPending(true);
    setGameStatus('Claiming victory…');

    socketRef.current.send(
      JSON.stringify({
        type: 'game.claimVictory',
        gameId: currentGameId,
      }),
    );
  }

  function handlePromotionChoice(pieceType) {
    if (!promotionChoice) return;

    const choice = promotionChoice;

    if (choice.premove) {
      const queued = queuePremove(
        choice.from,
        choice.to,
        pieceType,
      );

      if (queued) {
        closePromotionChoice();
        clearSelection();
      }

      return;
    }

    makeMove(
      choice.from,
      choice.to,
      pieceType,
    );
  }

  function tryExecuteNextPremove() {
    if (!gameIdRef.current || premoveSendingRef.current) return;

    const queue = premoveQueueRef.current;
    if (!queue.length) return;

    const color = playerColorRef.current;
    if (!color) { clearPremoves(); return; }

    const currentFen = fenRef.current;
    const currentGame = new Chess(currentFen);
    if (currentGame.turn() !== color) return;

    const move = queue[0];

    // A premove onto our own piece means the expected
    // capture never happened -> drop it.
    const destination = currentGame.get(move.to);
    if (destination && destination.color === color) {
      clearPremoves();
      return;
    }

    // Use the same simulation used for validation, so recaptures
    // and en passant are handled identically.
    const simulated = applyPremove(currentFen, move, color, false);
    if (!simulated) { clearPremoves(); return; }

    const sent = sendOnlineMove(
      move.from,
      move.to,
      move.promotion ?? '',
    );

    if (!sent) return;
    premoveSendingRef.current = true;
  }


  function queueOrPromptPremove(from, to) {
    if (!premovesEnabled) return;

    const piece = game.get(from);
    if (!piece) return;

    const needsPromotion =
      piece.type === 'p' &&
      ['1', '8'].includes(to[1]);

    if (needsPromotion) {
      setPromotionChoice({
        from,
        to,
        color: piece.color,
        premove: true,
      });

      return;
    }

    if (queuePremove(from, to)) {
      clearSelection();
    }
  }

  function handlePointerDown(event, square) {
    if (isReviewing) return;
    if (event.button !== 0) {
      return;
    }
    /*
    * Clicking a legal destination while a piece is selected
    * belongs to the click-to-move path, not drag initiation.
    */
    if (
      selectedSquare &&
      square !== selectedSquare &&
      legalMoves.includes(square)
    ) {
      return;
    }

    const piece = game.get(square);

    const color = isLichessGame
      ? playerColorRef.current
      : realGame.turn();

    if (!piece || !color) {
      return;
    }

    if (piece.color !== color) {
      return;
    }

    /*
    * Local games only allow the side to move.
    *
    * Online games allow dragging our pieces during the
    * opponent's turn to create premoves.
    */
    if (
      !isLichessGame &&
      realGame.turn() !== color
    ) {
      return;
    }

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );

    suppressPieceClickRef.current = true;

    setPointerDrag({
      pointerId: event.pointerId,
      square,
      destination: square,
      moved: false,
      clientX: event.clientX,
      clientY: event.clientY,
      piece,
    });

    setDraggingSquare(square);
    selectSquare(square);
  }

  function handlePointerMove(event) {
    if (isReviewing) return;

    if (
      !pointerDrag ||
      pointerDrag.pointerId !==
        event.pointerId
    ) {
      return;
    }

    const destination =
      document
        .elementFromPoint(
          event.clientX,
          event.clientY,
        )
        ?.closest('[data-square]')
        ?.dataset.square;

    if (destination) {
      setPointerDrag((current) => ({
        ...current,
        destination,
        clientX: event.clientX,
        clientY: event.clientY,
        moved:
          current.moved ||
          destination !== current.square,
      }));
    }
  }

  function handlePointerUp(event) {
    if (isReviewing) return;
      
    if (
      !pointerDrag ||
      pointerDrag.pointerId !== event.pointerId
    ) {
      return;
    }

    if (!pointerDrag.moved) {
      shouldCancelPremovesOnClick(pointerDrag.square);
    }

    try {
      if (
        event.currentTarget.hasPointerCapture(
          event.pointerId,
        )
      ) {
        event.currentTarget.releasePointerCapture(
          event.pointerId,
        );
      }
    } catch {
      // Pointer capture may already have been released.
    }

    if (pointerDrag.moved) {
      const color = isLichessGame
        ? playerColorRef.current
        : realGame.turn();

      const isOurTurn = realGame.turn() === color;

      const availableMoves = isOurTurn
        ? getLegalMovesForPiece(
            fenRef.current,
            pointerDrag.square,
          )
        : isLichessGame
          ? getAvailablePremoveMoves(
              pointerDrag.square,
            )
          : [];

      const canMove = availableMoves.some(
        (move) =>
          move.to === pointerDrag.destination,
      );

      if (canMove) {
        if (isOurTurn) {
          if (premoveQueueRef.current.length) {
            clearPremoves();
          }

          makeMove(
            pointerDrag.square,
            pointerDrag.destination,
            '',
            false,
          );
        } else if (isLichessGame && premovesEnabled) {
          queueOrPromptPremove(
            pointerDrag.square,
            pointerDrag.destination,
          );
        }
      }
    }

    setPointerDrag(null);
    setDraggingSquare(null);

    window.setTimeout(() => {
      suppressPieceClickRef.current = false;
    }, 0);
  }

  function handleArrowPointerDown(event) {
    if (event.button !== 2) return;

    const square =
      event.target.closest('[data-square]')?.dataset.square;
    if (!square) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setArrowDrag({
      pointerId: event.pointerId,
      from: square,
      to: square,
    });
  }

  function handleArrowPointerMove(event) {
    if (!arrowDrag || arrowDrag.pointerId !== event.pointerId) return;

    const square = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-square]')
      ?.dataset.square;

    if (square && square !== arrowDrag.to) {
      setArrowDrag((current) =>
        current ? { ...current, to: square } : null,
      );
    }
  }

  function handleArrowPointerUp(event) {
    if (!arrowDrag || arrowDrag.pointerId !== event.pointerId) return;

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture may already have been released.
    }

    const { from, to } = arrowDrag;
    setArrowDrag(null);

    // Right-click without dragging clears all arrows.
    if (from === to) {
      setArrows([]);
      return;
    }

    // Toggle: re-right-clicking the same arrow removes it.
    setArrows((current) => {
      const existing = current.findIndex(
        (arrow) => arrow.from === from && arrow.to === to,
      );

      if (existing !== -1) {
        return current.filter((_, index) => index !== existing);
      }

      return [...current, { from, to }];
    });
  }

  function handleArrowPointerCancel(event) {
    if (arrowDrag?.pointerId === event.pointerId) {
      setArrowDrag(null);
    }
  }

  function cancelLastPremove() {
    /*
     * Never remove the move currently waiting for
     * server confirmation. Doing so would leave the
     * sending lock without a corresponding queue entry.
     */
    if (premoveSendingRef.current) {
      return;
    }

    const queue =
      premoveQueueRef.current;

    if (!queue.length) {
      return;
    }

    const nextQueue =
      queue.slice(0, -1);

    premoveQueueRef.current =
      nextQueue;

    setPremoveQueue(nextQueue);
  }

  function handlePointerCancel(event) {
    if (isReviewing) return;

    if ( pointerDrag?.pointerId === event.pointerId ) {
      setPointerDrag(null);
      setDraggingSquare(null);
      suppressPieceClickRef.current =
        false;
    }
  }

  function sendOnlineMove(
    from,
    to,
    promotion = '',
  ) {
    const socket = socketRef.current;
    const currentGameId =
      gameIdRef.current;

    if (
      socket?.readyState !==
        WebSocket.OPEN ||
      !currentGameId
    ) {
      return false;
    }

    setDrawOffer(false);

    socket.send(
      JSON.stringify({
        type: 'game.move',
        gameId: currentGameId,
        uci: `${from}${to}${promotion}`,
      }),
    );

    return true;
  }

  function queuePremove(from, to, promotion = '') {
    const color = playerColorRef.current;
    if (!gameIdRef.current || !color) return false;

    const nextMove = { from, to, promotion };

    // Build the FEN that includes the existing queue.
    const baseFen = premoveQueueRef.current.length
      ? getPremovePosition(fenRef.current, premoveQueueRef.current, color) ?? fenRef.current
      : fenRef.current;

    const valid = validatePremoveSequence(baseFen, [nextMove], color, true);
    if (!valid) return false;

    const nextQueue = [...premoveQueueRef.current, nextMove];
    premoveQueueRef.current = nextQueue;
    setPremoveQueue(nextQueue);

    if (new Chess(fenRef.current).turn() === color && !premoveSendingRef.current) {
      window.setTimeout(() => tryExecuteNextPremove(), 0);
    }

    return true;
  }

  
  return (
    <main className="app-shell">
      <section
        className="intro-panel"
        aria-labelledby="page-title"
      >
        <h2>Chess Quest</h2>

        <div className="account-panel">
          {authLoading ? (
            <span className="account-status">
              Checking account...
            </span>
          ) : account ? (
            <>
              <span className="account-status">
                Connected as{' '}
                <strong>
                  {account.username}
                </strong>{' '}
                (
                {account.perfs.rapid.rating || 'unrated'}
                )
              </span>

              <button
                className="account-button secondary"
                type="button"
                onClick={handleLogout}
              >
                Log out
              </button>
            </>
          ) : (
            <button
              className="account-button"
              type="button"
              onClick={handleLogin}
            >
              Connect Lichess
            </button>
          )}
        </div>

        <div
          className="account-panel"
          aria-label="Right rail view"
        >
          <button
            className="account-button secondary"
            type="button"
            onClick={() =>
              setRightRailView('hello')
            }
          >
            Select Skin
          </button>

          <button
            className="account-button secondary"
            type="button"
            onClick={() =>
              setRightRailView('game')
            }
          >
            Game and chat
          </button>

          <button
            className="account-button secondary"
            type="button"
            onClick={() =>
              setRightRailView('out-of-game')
            }
            disabled={
              gameStatus === 'Game in progress' ||
              gameStatus === 'Searching for an opponent...' ||
              gameStatus === 'Draw offered'
            }
          >
            Out of game
          </button>
        </div>

        {gameStatus && (
          <p
            className="game-status"
            aria-live="polite"
          >
            {gameStatus}
          </p>
        )}
      </section>

      <section
        className="board-panel"
        aria-label="Chessboard sandbox"
      >
        <div className="board-game-area">
          <div
            className="board-frame"
            ref={boardFrameRef}
          >
            {promotionChoice && (
              <div
                className="promotion-popup"
                role="dialog"
                aria-label="Choose a promotion piece"
                style={{
                  left: `${promotionPopupStyle.left}px`,
                  top: `${promotionPopupStyle.top}px`,
                }}
                onClick={(event) =>
                  event.stopPropagation()
                }
              >
                {promotionOptions.map(
                  (pieceType) => (
                    <button
                      key={pieceType}
                      type="button"
                      className="promotion-option"
                      onClick={(event) => {
                        event.stopPropagation();
                        handlePromotionChoice(
                          pieceType,
                        );
                      }}
                      aria-label={`Promote pawn to ${getPromotionLabel(
                        pieceType,
                      )}`}
                    >
                      <PieceVisual
                        color={
                          promotionChoice.color
                        }
                        type={pieceType}
                        skinFolder={getSkinFolderForColor(
                          promotionChoice.color,
                        )}
                        className="promotion-piece"
                      />
                    </button>
                  ),
                )}
              </div>
            )}

            {pointerDrag &&
              pointerDrag.piece && (
                <div
                  className="piece dragged-piece"
                  style={{
                    left: pointerDrag.clientX,
                    top: pointerDrag.clientY,
                  }}
                >
                  <PieceVisual
                    color={
                      pointerDrag.piece.color
                    }
                    type={
                      pointerDrag.piece.type
                    }
                    skinFolder={getSkinFolderForColor(
                      pointerDrag.piece.color,
                    )}
                  />
                </div>
              )}

            <div className="board-layout">
              <div
                className="rank-labels"
                aria-hidden="true"
              >
                {boardRanks.map((rank) => (
                  <span key={rank}>
                    {rank}
                  </span>
                ))}
              </div>

              <div className="board-column">
                <ChessBoard
                  game={game}
                  boardFiles={boardFiles}
                  boardRanks={boardRanks}
                  selectedSquare={selectedSquare}
                  lastMove={boardLastMove}
                  legalMoves={legalMoves}
                  draggingSquare={draggingSquare}
                  onSquareClick={
                    handleSquareClick
                  }
                  onPieceClick={
                    handlePieceClick
                  }
                  onPointerDown={
                    handlePointerDown
                  }
                  onPointerMove={
                    handlePointerMove
                  }
                  onPointerUp={
                    handlePointerUp
                  }
                  onPointerCancel={
                    handlePointerCancel
                  }
                  onBoardClick={() => {
                    if (promotionChoice) {
                      closePromotionChoice();
                    }
                  }}
                  arrows={arrows}
                  arrowDrag={arrowDrag}
                  onArrowPointerDown={handleArrowPointerDown}
                  onArrowPointerMove={handleArrowPointerMove}
                  onArrowPointerUp={handleArrowPointerUp}
                  onArrowPointerCancel={handleArrowPointerCancel}
                  moveAnimation={
                    moveAnimation
                  }
                  onMoveAnimationEnd={
                    finishMoveAnimation
                  }
                  skinFolder={
                    selectedSkinFolder
                  }
                  playerColor={
                    playerColor
                  }
                  opponentSkinFolder={
                    selectedOpponentSkinFolder
                  }
                  checkedSquare={
                    checkedSquare
                  }
                  premoveSquares={
                    premoveSquares
                  }
                />

                <div
                  className="file-labels"
                  aria-hidden="true"
                >
                  {boardFiles.map((file) => (
                    <span key={file}>
                      {file}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside
        className="right-rail"
        aria-label="Game controls and chat"
      >
        {(() => {
          switch (rightRailView) {
            case 'hello':
              return (
                <div
                  className="skin-picker"
                  aria-label="Choose a piece skin"
                >
                  <div className="skin-picker-heading">
                    <span className="chat-kicker">
                      Piece skins
                    </span>

                    <h2>Choose a set</h2>

                    <label className="skin-opponent-toggle">
                      <input
                        type="checkbox"
                        checked={
                          selectingOpponentSkin
                        }
                        onChange={(event) =>
                          setSelectingOpponentSkin(
                            event.target.checked,
                          )
                        }
                      />
                      Select for opponent
                    </label>
                  </div>

                  <div className="skin-options">
                    {skinFolders.map(
                      (folder) => (
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
                          onClick={() =>
                            selectSkinFolder(
                              folder,
                            )
                          }
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
                          <img
                            src={`/${folder}/king.png`}
                            alt={`${folder} king skin`}
                          />

                          <span>
                            {folder}
                          </span>
                        </button>
                      ),
                    )}
                  </div>

                  {!skinFolders.length && (
                    <p className="skin-empty">
                      No piece skins found.
                    </p>
                  )}
                </div>
              );

            case 'out-of-game':
              return <div>out of game</div>;

            default:
              return (
                <>
                  {gameMode !==
                  GAME_MODE.LOCAL ? (
                    clockSnapshot?.wtime !=
                      null &&
                    clockSnapshot?.btime !=
                      null && (
                      <div
                        className="clock-panel"
                        aria-label="Time remaining"
                      >
                        <div
                          className={`clock-card ${
                            clockSnapshot.turn === 'w'
                              ? 'active'
                              : ''
                          } ${
                            whiteTime < 30000
                              ? 'low-time'
                              : ''
                          }`}
                        >
                          <span className="clock-player">
                            White
                          </span>

                          <strong>
                            {formatClock(
                              whiteTime,
                            )}
                          </strong>

                          <div className="capture-group">
                            <div className="capture-pieces">
                              {capturedPieces.b.map(
                                (
                                  piece,
                                  index,
                                ) => (
                                  <span
                                    className="captured-piece"
                                    key={`${piece}-${index}`}
                                  >
                                    <PieceVisual
                                      color="b"
                                      type={
                                        piece
                                      }
                                      skinFolder={getSkinFolderForColor(
                                        'b',
                                      )}
                                    />
                                  </span>
                                ),
                              )}
                            </div>
                          </div>
                        </div>

                        <div
                          className={`clock-card ${
                            clockSnapshot.turn === 'b'
                              ? 'active'
                              : ''
                          } ${
                            blackTime < 30000
                              ? 'low-time'
                              : ''
                          }`}
                        >
                          <span className="clock-player">
                            Black
                          </span>

                          <strong>
                            {formatClock(
                              blackTime,
                            )}
                          </strong>

                          <div className="capture-group">
                            <div className="capture-pieces">
                              {capturedPieces.w.map(
                                (
                                  piece,
                                  index,
                                ) => (
                                  <span
                                    className="captured-piece"
                                    key={`${piece}-${index}`}
                                  >
                                    <PieceVisual
                                      color="w"
                                      type={
                                        piece
                                      }
                                      skinFolder={getSkinFolderForColor(
                                        'w',
                                      )}
                                    />
                                  </span>
                                ),
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  ) : (
                      <TimeControlPicker
                        value={selectedTimeControl}
                        onChange={setSelectedTimeControl}
                        disabled={matchmaking || Boolean(gameId)}
                      />
                  )}
                  {isLichessGame && (
                    <label className="premove-toggle">
                      <input
                        type="checkbox"
                        checked={premovesEnabled}
                        onChange={(event) => setPremovesEnabled(event.target.checked)}
                      />
                      <span>Enable premoves</span>
                    </label>
                  )}
                  <div
                    className="game-actions"
                    aria-label="Game actions"
                  >
                    <button
                      className="account-button"
                      type="button"
                      onClick={
                        matchmaking
                          ? handleCancel
                          : handlePlay
                      }
                      disabled={
                        !socketReady ||
                        cancellingMatchmaking ||
                        (!matchmaking &&
                          Boolean(gameId))
                      }
                    >
                      {cancellingMatchmaking
                        ? 'Cancelling...'
                        : matchmaking
                          ? 'Cancel'
                          : gameId
                            ? 'Playing'
                            : socketReady
                              ? 'Play'
                              : 'Connecting...'}
                    </button>

                    {gameId && (
                      <>
                        <button
                          className="account-button"
                          type="button"
                          onClick={handleDraw}
                        >
                          {drawOffer
                            ? 'Accept draw'
                            : drawPending
                              ? 'Cancel draw offer'
                              : 'Offer draw'}
                        </button>

                        <button
                          className="account-button danger"
                          type="button"
                          onClick={handleResign}
                        >
                          Resign
                        </button>

                        {isLichessGame &&
                          opponentGone &&
                          clockSnapshot?.status === 'started' && (
                            <button
                              className="account-button"
                              type="button"
                              onClick={handleClaimVictory}
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

                  <div
                    className="chat-panel"
                    aria-label="Game chat and move history"
                  >
                    
                   <div className="chat-header">
                    <div>
                      <span className="chat-kicker">Lichess</span>
                      <h2>
                        {rightRailView === 'history' ? 'Move history' : 'Game chat'}
                      </h2>
                    </div>

                    <div className="chat-header-actions">
                      {rightRailView === 'history' && uciHistory.length > 0 && (
                        <>
                          <button
                            className="history-step-button"
                            type="button"
                            onClick={stepBackward}
                            disabled={!canStepBackward}
                            aria-label="Previous move"
                            title="Previous move"
                          >
                            ‹
                          </button>

                          <button
                            className="history-step-button"
                            type="button"
                            onClick={stepForward}
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
                            onClick={() => setReviewPly(null)}
                            disabled={!isReviewing}
                          >
                            {isReviewing ? '⟲ Live' : '● Live'}
                          </button>
                        </>
                      )}

                      <button
                        className="account-button secondary"
                        type="button"
                        onClick={() =>
                          setRightRailView((current) =>
                            current === 'history' ? 'game' : 'history',
                          )
                        }
                        aria-pressed={rightRailView === 'history'}
                      >
                        {rightRailView === 'history' ? 'Chat' : 'History'}
                      </button>
                    </div>
                  </div>
                    

                    {rightRailView === 'history' ? (
                      <div className="move-history">
                        {moveHistory.length === 0 ? (
                          <p className="chat-empty">No moves yet.</p>
                        ) : (
                          moveHistory
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
                                <div className="history-row" key={row.number}>
                                  <span>{row.number}. </span>
                                  <button
                                    type="button"
                                    className={`history-move ${
                                      isWhiteCurrent ? 'current' : ''
                                    }`}
                                    onClick={() =>
                                      setReviewPly(
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
                                          setReviewPly(
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
                            })
                        )}
                      </div>
                    ) : (
                      <>
                        <div
                          className="chat-messages"
                          ref={
                            chatMessagesRef
                          }
                          aria-live="polite"
                        >
                          {!gameId && (
                            <p className="chat-empty">
                              Join a game to
                              chat.
                            </p>
                          )}

                          {gameId &&
                            chatMessages.length ===
                              0 && (
                              <p className="chat-empty">
                                No messages yet.
                              </p>
                            )}

                          {chatMessages.map(
                            (
                              message,
                              index,
                            ) => (
                              <div
                                className="chat-message"
                                key={`${message.username}-${message.text}-${index}`}
                              >
                                <strong>
                                  {
                                    message.username
                                  }
                                </strong>

                                <span>
                                  {
                                    message.text
                                  }
                                </span>
                              </div>
                            ),
                          )}
                        </div>

                        <form
                          className="chat-form"
                          onSubmit={
                            handleChatSubmit
                          }
                        >
                          <label
                            className="sr-only"
                            htmlFor="chat-message"
                          >
                            Chat message
                          </label>

                          <input
                            id="chat-message"
                            type="text"
                            value={chatText}
                            maxLength={140}
                            placeholder={
                              gameId
                                ? 'Write a message'
                                : 'Join a game first'
                            }
                            disabled={
                              !gameId ||
                              !socketReady
                            }
                            onChange={(
                              event,
                            ) => {
                              setChatText(
                                event.target
                                  .value,
                              );

                              if (chatError) {
                                setChatError(
                                  '',
                                );
                              }
                            }}
                          />

                          <button
                            className="chat-send"
                            type="submit"
                            disabled={
                              !gameId ||
                              !socketReady ||
                              !chatText.trim()
                            }
                            aria-label="Send chat message"
                          >
                            Send
                          </button>
                        </form>

                        <div className="chat-footer">
                          <span>
                            {chatText.length}
                            /140
                          </span>

                          {chatError && (
                            <span
                              className="chat-error"
                              role="alert"
                            >
                              {chatError}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </>
              );
          }
        })()}
      </aside>
    </main>
  );
}

export default App;