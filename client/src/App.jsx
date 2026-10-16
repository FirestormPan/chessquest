import { useEffect, useRef, useState, useMemo } from 'react';
import { Chess } from 'chess.js';
import {  parseUciMoves,  getLegalMovesForPiece,  applyMoves, applyPremove ,  getCapturedPieces,  getMoveHistory,  getCheckedKingSquare,  getPremoveMovesForPiece,  validatePremoveSequence, getPremovePosition, truncateUciMoves}   from './boardRules';
import { GAME_MODE, GAME_PHASE, getCapabilities, canPlayerMove } from './gameMode';
import {  TIME_CONTROL_CATEGORIES,  isRatedAllowed,} from './timeControls';
import PieceVisual from './components/PieceVisual';
import ChessBoard from './components/ChessBoard';
import { getBotMove } from './botEngine';
import RightRail from './components/RightRail';

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const ranks = [8, 7, 6, 5, 4, 3, 2, 1];

const promotionOptions = ['q', 'r', 'b', 'n'];

const promotionNames = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
};

const DOUBLE_CLICK_MS = 300;

function clockValue(value) {
  const milliseconds = Number(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function describeGameResult(event, { playerColor }) {
  const winner = event.winner; // 'white' | 'black' | undefined

  if (winner === 'white' || winner === 'black') {
    const winnerColor = winner === 'white' ? 'w' : 'b';
    return winnerColor === playerColor ? 'You won' : 'Opponent won';
  }

  switch (event.status) {
    case 'draw':
    case 'stalemate':
      return 'Draw';
    case 'aborted':
      return 'Game aborted';
    case 'noStart':
      return 'Game did not start';
    default:
      return `Game ended (${event.status})`;
  }
}

function getPromotionLabel(pieceType) {
  return promotionNames[pieceType] ?? pieceType;
}

function App() {
  const socketRef = useRef(null);

  const gameStartFenRef  = useRef(null);
  const fenRef = useRef(new Chess().fen());

  const uciHistoryRef = useRef([]);

  const playerColorRef = useRef(null);
  const gameIdRef = useRef(null);

  const [confirmResign, setConfirmResign] = useState(false);

  const moveCountRef = useRef(0);
  const lastClickRef = useRef({ square: null, time: 0 });
  const suppressPieceClickRef = useRef(false);
  const selectedSquareRef = useRef(null);

  const boardFrameRef = useRef(null);
  const animationTimerRef = useRef(null);

  const premoveQueueRef = useRef([]);
  const premoveSendingRef = useRef(false);

  const matchmakingAttemptRef = useRef(null);
  


  const [takebackOffer, setTakebackOffer] = useState(false);    // opponent offered
  const [takebackPending, setTakebackPending] = useState(false); // we offered
  const takebackPendingRef = useRef(false);
  const [gameRated, setGameRated] = useState(false);

  const [fen, setFen] = useState(() => new Chess().fen());
  const [lastMove, setLastMove] = useState(null);
  const [moveAnimation, setMoveAnimation] = useState(null);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
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

  const [rightRailView, setRightRailView] = useState('bot');

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

  const botSearchControllerRef = useRef(null);
  const [botGame, setBotGame] = useState({
    status: 'idle',        // 'idle' | 'playing' | 'ended'
    strength: 1000,
    colorMode: 'w',        // 'w' | 'b' | 'random' — the *preference*
  });

  function resetBot() {
    setBotGame((current) => ({
      ...current,           // keep preferences
      status: 'idle',
    }));
  }


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
    if (!gameStartFenRef.current) return null;

    try {
      return applyMoves(
        gameStartFenRef.current,
        uciHistory.slice(0, reviewPly),
      );
    } catch {
      return null;
    }
  }, [reviewPly, uciHistory]);

  const boardFen = reviewFen ?? displayFen;

  const displayGame  = useMemo(() => new Chess(boardFen), [boardFen]);


  const capabilities = useMemo(() => getCapabilities(gameMode), [gameMode]);

  const phase = useMemo(() => {
    if (matchmaking) return GAME_PHASE.SEARCHING;
    if (gameMode === GAME_MODE.BOT) {
      return botGame.status === 'playing' ? GAME_PHASE.PLAYING : GAME_PHASE.IDLE;
    }
    if (gameId) return GAME_PHASE.PLAYING;
    return GAME_PHASE.IDLE;
  }, [matchmaking, gameId, gameMode, botGame.status]);

  const checkedSquare = getCheckedKingSquare(boardFen);

  const isReviewing = reviewPly != null;

  const boardLastMove = useMemo(() => {
    if (reviewPly == null) return lastMove;

    const move = uciHistory[reviewPly - 1];
    if (!move) return null;

    return { from: move.slice(0, 2), to: move.slice(2, 4) };
  }, [reviewPly, uciHistory, lastMove]);

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
  function handleBotColorModeChange(mode) {
    setBotGame((current) => ({ ...current, colorMode: mode }));
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
  
  function handleChatTextChange(value) {
    setChatText(value);
    if (chatError) setChatError('');
  }

  function commitPosition(nextFen, {
    uciMoves,
    animate = null,
    clearArrows = false,
  }) {
    /*
     * Update the ref before scheduling any state, so a second
     * commitPosition call in the same tick reads this one's list.
     */
    uciHistoryRef.current = uciMoves;

    if (animate) {
      animateMove(animate.from, animate.to, animate.piece);
    }

    if (clearArrows) {
      setArrows([]);
    }

    const baseFen = gameStartFenRef.current;

    const lastUciMove = uciMoves[uciMoves.length - 1];

    setLastMove(
      lastUciMove
        ? {
            from: lastUciMove.slice(0, 2),
            to: lastUciMove.slice(2, 4),
          }
        : null,
    );

    setUciHistory(uciMoves);
    setMoveHistory(getMoveHistory(baseFen, uciMoves));
    setCapturedPieces(getCapturedPieces(baseFen, uciMoves));

    fenRef.current = nextFen;
    setFen(nextFen);
    setReviewPly(null);
  }

  function clearPremoves() {
    premoveQueueRef.current = [];
    setPremoveQueue([]);
    premoveSendingRef.current = false;
  }

  function getAvailablePremoveMoves(square) {
    const color = playerColorRef.current;

    if (!capabilities.premoves || !color) {
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
  const piece = displayGame.get(square);

  if (!piece) {
    clearSelection();
    return;
  }

  const color = capabilities.assignedColor
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

  if (capabilities.premoves && premovesEnabled) {
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
    if (!confirmResign) {
      setConfirmResign(true);
      return;
    }

    if (gameMode === GAME_MODE.BOT) {
      if (botGame.status !== 'playing') return;

      botSearchControllerRef.current?.abort();

      setBotGame((current) => ({ ...current, status: 'ended' }))
      setGameStatus('You resigned. Bot wins.');
      setConfirmResign(false);

      return;
    }

    const currentGameId = gameIdRef.current;

    if (
      !currentGameId ||
      socketRef.current?.readyState !== WebSocket.OPEN
    ) {
      setConfirmResign(false);
      return;
    }

    socketRef.current.send(
      JSON.stringify({
        type: 'game.resign',
        gameId: currentGameId,
      }),
    );

    setGameStatus('Resigning game...');
    setConfirmResign(false);
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

  function handleTakeback(action) {
    // action: 'offer' | 'accept' | 'decline'
    const currentGameId = gameIdRef.current;
    if (!currentGameId || socketRef.current?.readyState !== WebSocket.OPEN) return;
    if (action === 'offer' && (takebackOffer || takebackPending)) return;
    if ((action === 'accept' || action === 'decline') && !takebackOffer) return;

    socketRef.current.send(
      JSON.stringify({
        type: 'game.takeback',
        gameId: currentGameId,
        action,
      }),
    );

    if (action === 'offer') {
      takebackPendingRef.current = true;
      setTakebackPending(true);
      setGameStatus('Takeback offered');
    } else if (action === 'accept') {
      setTakebackOffer(false);
      setGameStatus('Takeback accepted');
    } else {
      setTakebackOffer(false);
      setGameStatus('Takeback declined');
    }
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
    if (gameMode !== GAME_MODE.BOT) return undefined;
    
    if (botGame.status !== 'playing') return undefined;

    const humanColor = playerColorRef.current;
    if (!humanColor) return undefined;

    const botColor = humanColor === 'w' ? 'b' : 'w';
    const chess = new Chess(fenRef.current);

    if (chess.isGameOver()) return undefined;
    if (chess.turn() !== botColor) return undefined;

    const requestFen = fenRef.current;
    const controller = new AbortController();
    botSearchControllerRef.current = controller;

    const timer = window.setTimeout(async () => {
      try {
         const move = await getBotMove(requestFen, { strength: botGame.strength, signal: controller.signal });

          if (
            !move ||
            controller.signal.aborted ||
            fenRef.current !== requestFen
          ) {
            return;
          }

        const latest = new Chess(fenRef.current);
        const isLegal = latest.moves({ verbose: true }).some(
          (candidate) =>
            candidate.from === move.from &&
            candidate.to === move.to &&
            candidate.promotion === move.promotion,
        );

        if (latest.isGameOver() || latest.turn() !== botColor || !isLegal) {
          if (!latest.isGameOver()) {
            setGameStatus('Bot engine returned an invalid move.');
          }
          return;
        }

        makeMove(move.from, move.to, move.promotion || '', true);
      } catch {
        if (!controller.signal.aborted) {
          setGameStatus('Unable to start the bot engine.');
        }
      } finally {
        if (botSearchControllerRef.current === controller) {
          botSearchControllerRef.current = null;

        }
      }
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (botSearchControllerRef.current === controller) {
        botSearchControllerRef.current = null;
      }
    };
  }, [fen, gameMode, botGame.status, botGame.strength]);
 
  useEffect(() => {
    if (gameMode !== GAME_MODE.BOT) return;
    if (botGame.status !== 'playing') return;

    const chess = new Chess(fen);

    if (!chess.isGameOver()) return;

    let message = 'Game over.';

    if (chess.isCheckmate()) {
      const humanLost = chess.turn() === playerColorRef.current;

      message = humanLost
        ? 'Checkmate. Bot wins.'
        : 'Checkmate. You win!';
    } else if (chess.isStalemate()) {
      message = 'Stalemate — draw.';
    } else if (chess.isThreefoldRepetition()) {
      message = 'Draw by threefold repetition.';
    } else if (chess.isInsufficientMaterial()) {
      message = 'Draw by insufficient material.';
    } else if (chess.isDraw()) {
      message = 'Draw.';
    }

    botSearchControllerRef.current?.abort();

    setBotGame((current) => ({ ...current, status: 'ended' }))
    setGameStatus(message);
  },[fen, gameMode, botGame.status]);

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
    if ( !promotionChoice || !boardFrameRef.current ) {
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
        squareRect.left + squareRect.width / 2,
      top:
        squareRect.top + squareRect.height / 2,
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
      window.location.protocol === 'https:' ? 'wss' : 'ws';

    const socket = new WebSocket(
      `${protocol}://${window.location.host}/ws`,
    );

    socketRef.current = socket;

    socket.onopen = () => {
      if (socketRef.current !== socket) return;

      setSocketReady(true);
      setGameStatus('Connected to game server');

      const activeGame = localStorage.getItem('chessquest:active-game');
        if (activeGame) {
          socket.send(JSON.stringify({ type: 'game.resume' }));
        }
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
        matchmakingAttemptRef.current = null;
        gameIdRef.current = payload.gameId;
        setMatchmaking(false);
        setGameStatus('Opponent found, waiting for game details...');
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

        if (payload.scope === 'matchmaking') {
          matchmakingAttemptRef.current = null;
          setMatchmaking(false);
        }
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

      if (payload.type === 'game.takeback.result') {
        if (!payload.ok) {
          takebackPendingRef.current = false;
          setTakebackPending(false);
          setGameStatus(payload.message ?? 'Takeback request was rejected');
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
        const color = event.white?.id?.toLowerCase() === account.username?.toLowerCase() ? 'w' : 'b';

        gameStartFenRef.current = event.initialFen;

        localStorage.setItem('chessquest:active-game', event.id);

        const nextFen = applyMoves(
          event.initialFen,
          event.state.moves,
        );

        const moves = parseUciMoves(
          event.state.moves,
        );

        moveCountRef.current = moves.length;

        playerColorRef.current = color;
        setPlayerColor(color);

        gameIdRef.current = event.id;
        setGameId(event.id);
        setGameRated(Boolean(event.rated));

        setGameMode(GAME_MODE.LICHESS);
        setMatchmaking(false);
        setGameStatus('Game in progress');

        setOpponentGone(false);
        setClaimWinInSeconds(null);
        setClaimPending(false);

        setDrawOffer(false);
        drawPendingRef.current = false;
        setDrawPending(false);

        setChatMessages(
          Array.isArray(event.chat) ? event.chat : [],
        );

        setChatError('');

        commitPosition(nextFen, {
          uciMoves: moves,
          clearArrows: true,
        });

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

        if (event.state.status !== 'started') {
          const result = describeGameResult(
            { winner: undefined, status: event.state.status },
            { playerColor: color },
          );

          setChatMessages((current) => [
            ...current,
            { room: 'system', username: '', text: result },
          ]);

          setGameStatus(result);

          localStorage.removeItem('chessquest:active-game');

          gameIdRef.current = null;
          setGameId(null);

          setGameMode(GAME_MODE.LOCAL);

          setArrows([]);
          clearSelection();
          clearPremoves();
        }

        return;
      }

        if (
        event.type === 'gameState' &&
        gameStartFenRef.current
      ) {
        const nextFen = applyMoves(
          gameStartFenRef.current,
          event.moves,
        );

        const moves = parseUciMoves(
          event.moves,
        );

        const newMoves = moves.slice(
          moveCountRef.current,
        );

        const moveWasMade = newMoves.length > 0;

        moveCountRef.current = moves.length;

        const ownDrawOffer =
          playerColorRef.current === 'w' ? event.wdraw : event.bdraw;

        const opponentDrawOffer =
          playerColorRef.current === 'w' ? event.bdraw : event.wdraw;

        const ownTakebackOffer =
          playerColorRef.current === 'w' ? event.wtakeback : event.btakeback;
        const opponentTakebackOffer =
          playerColorRef.current === 'w' ? event.btakeback : event.wtakeback;

        if (moveWasMade) {
          takebackPendingRef.current = false;
          setTakebackPending(false);
          setTakebackOffer(false);
        } else {
          setDrawOffer(Boolean(opponentDrawOffer));
          drawPendingRef.current = Boolean(ownDrawOffer);
          setDrawPending(Boolean(ownDrawOffer));

          setTakebackOffer(Boolean(opponentTakebackOffer));
          takebackPendingRef.current = Boolean(ownTakebackOffer);
          setTakebackPending(Boolean(ownTakebackOffer));
        }

        /*
         * Single write path for the position and its derived
         * state. Replaces the previous hand-rolled updates to
         * fenRef, fen, uciHistory, moveHistory, lastMove,
         * capturedPieces, arrows, and reviewPly.
         */
        commitPosition(nextFen, {
          uciMoves: moves,
          clearArrows: newMoves.length > 0,
        });

        const gameEnded = event.status !== 'started';

        if (gameEnded) {
          clearSelection();
          clearPremoves();
        } else {
          reconcilePremoves(
            nextFen,
            newMoves,
          );
        }

        if (!gameEnded && selectedSquareRef.current) {
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

        if (gameEnded) {

          const result = describeGameResult(event, {
            playerColor: playerColorRef.current,
          });

          setChatMessages((current) => [
            ...current,
            {
              room: 'system',
              username: '',
              text: result,
            },
          ]);


          setGameStatus(result);

          localStorage.removeItem('chessquest:active-game');

          setOpponentGone(false);
          setClaimWinInSeconds(null);
          setClaimPending(false);

          gameIdRef.current = null;
          setGameId(null);

          moveCountRef.current = 0;

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
      matchmakingAttemptRef.current?.abortController?.abort();
      matchmakingAttemptRef.current = null;
      setMatchmaking(false);

      setGameStatus('Game server disconnected');
    };

    return () => {
      setSocketReady(false);

      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      socket.close();
    };
  }, [account]);

  async function handleOnlinePlay() {
    if (
      !socketReady ||
      socketRef.current?.readyState !== WebSocket.OPEN ||
      matchmakingAttemptRef.current
    ) {
      setGameStatus('Game server is not connected');
      return;
    }

    const { time, increment, rated } = selectedTimeControl;
    if (rated && !isRatedAllowed(time)) {
      setGameStatus('Rated games require Rapid or slower.');
      return;
    }

    const attemptId = crypto.randomUUID();
    const abortController = new AbortController();

    const startPromise = fetch('/api/game/start', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time, increment, rated, attemptId }),
      signal: abortController.signal,
    }).then(async (response) => ({ response, data: await response.json() }));

    matchmakingAttemptRef.current = { id: attemptId, promise: startPromise, abortController };

    resetForNewGame();
    socketRef.current.send(JSON.stringify({ type: 'matchmaking.start', attemptId }));
    setMatchmaking(true);
    setGameStatus('Searching for an opponent...');

    try {
      const { response, data } = await startPromise;
      if (!response.ok) throw new Error(data.error ?? 'Unable to start game search');
    } catch (error) {
      socketRef.current?.send(JSON.stringify({ type: 'matchmaking.cancel', attemptId }));
      if (matchmakingAttemptRef.current?.id === attemptId) {
        matchmakingAttemptRef.current = null;
        setMatchmaking(false);
        if (error.name !== 'AbortError') setGameStatus(error.message);
      }
    }
  }

  function resetForNewGame() {
    botSearchControllerRef.current?.abort();
    clearPremoves();

    const newGame = new Chess();
    fenRef.current = newGame.fen();
    setFen(fenRef.current);

    setCapturedPieces({ w: [], b: [] });
    setClockSnapshot(null);

    gameStartFenRef.current = null;
    playerColorRef.current = null;
    gameIdRef.current = null;
    moveCountRef.current = 0;

    resetBot()
    setConfirmResign(false);

    drawPendingRef.current = false;
    localStorage.removeItem('chessquest:active-game');

    setGameId(null);
    setGameRated(false);
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

    uciHistoryRef.current = [];

    clearSelection();
    closePromotionChoice();

    setOpponentGone(false);
    setClaimWinInSeconds(null);
    setClaimPending(false);

    takebackPendingRef.current = false;
    setTakebackPending(false);
    setTakebackOffer(false);

  }

  async function handleCancel() {
    const attempt = matchmakingAttemptRef.current;
    if (!attempt) return;
    const attemptId = attempt.id;

    socketRef.current?.send(
      JSON.stringify({ type: 'matchmaking.cancel', attemptId })
    );
    setCancellingMatchmaking(true);

    try {
      if (attempt.promise) {
        try {
          await attempt.promise;
        } catch {
          // The start handler reports its own error.
        }
      }

      // The attempt may have changed while awaiting the start request.
      if (matchmakingAttemptRef.current?.id !== attemptId) {
        return;
      }

      // A game was found while cancellation was pending.
      if (gameIdRef.current) {
        setMatchmaking(false);
        setGameStatus('Game found');
        matchmakingAttemptRef.current = null;
        return;
      }

      const response = await fetch('/api/game/cancel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 404) {
        if (gameIdRef.current) {
          setGameStatus('Game found');
        } else {
          setGameStatus('Game search is no longer active');
        }

        if (matchmakingAttemptRef.current?.id === attemptId) {
          matchmakingAttemptRef.current = null;
        }

        setMatchmaking(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? 'Unable to cancel game search');
      }

      if (matchmakingAttemptRef.current?.id === attemptId) {
        matchmakingAttemptRef.current = null;
      }

      setMatchmaking(false);
      setGameStatus('Game search cancelled');
    } catch (error) {
      if (matchmakingAttemptRef.current?.id === attemptId) {
        matchmakingAttemptRef.current = null;
      }

      setMatchmaking(false);
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
      gameStartFenRef.current = null;
      playerColorRef.current = null;

      setGameId(null);
      setPlayerColor(null);
      setGameMode(GAME_MODE.LOCAL);

      setOpponentGone(false);
      setClaimWinInSeconds(null);
      setClaimPending(false);

      resetBot()
      setConfirmResign(false);

      setAccount(null);
    } catch {
      // Keep the UI responsive.
    }
  }

  function handlePlayBot() {
    const humanColor =
      botGame.colorMode === 'random'
        ? (Math.random() < 0.5 ? 'w' : 'b')
        : botGame.colorMode;

    botSearchControllerRef.current?.abort();
    clearPremoves();

    const newGame = new Chess();
    const startFen = newGame.fen();

    fenRef.current = startFen;
    setFen(startFen);

    gameStartFenRef.current = startFen;
    playerColorRef.current = humanColor;
    gameIdRef.current = null;
    moveCountRef.current = 0;
    drawPendingRef.current = false;

    setGameId(null);
    setGameMode(GAME_MODE.BOT);
    setPlayerColor(humanColor);

    setBotGame((current) => ({
      ...current,
      status: 'playing',
    }));


    setCapturedPieces({ w: [], b: [] });
    setClockSnapshot(null);
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
    uciHistoryRef.current = [];

    clearSelection();
    closePromotionChoice();

    setOpponentGone(false);
    setClaimWinInSeconds(null);
    setClaimPending(false);

    setGameStatus(`Playing vs Bot (~${botGame.strength}, estimated)`);
    setRightRailView('game');
  }

  function handlePlayAgain() {
    resetForNewGame();
    setRightRailView('bot');
  }

  function handleBotTakeback() {
    if (gameMode !== GAME_MODE.BOT) return;
    if (botGame.status !== 'playing') return;    

    const currentGame = new Chess(fenRef.current);
    if (currentGame.isGameOver()) return;

    const moves = uciHistoryRef.current;
    if (moves.length === 0) return;

    const humanColor = playerColorRef.current;
    if (!humanColor) return;

    /*
    * Remove one ply if it's the bot's turn (the bot hasn't
    * replied yet), or two plies if it's the human's turn
    * (the bot already moved). Either way the result is a
    * position where the human is to move.
    */
    const botColor = humanColor === 'w' ? 'b' : 'w';
    const pliesToRemove =
      currentGame.turn() === botColor ? 1 : 2;

    if (moves.length < pliesToRemove) return;

    botSearchControllerRef.current?.abort();

    const truncated = truncateUciMoves(moves, pliesToRemove);
    const nextFen = applyMoves(gameStartFenRef.current, truncated);

    commitPosition(nextFen, {
      uciMoves: truncated,
      clearArrows: true,
    });

    setGameStatus('Takeback');
  }

  function handleSquareClick(square) {
    if (isReviewing) return;
    if (promotionChoice) {
      closePromotionChoice();
      return;
    }

    if (new Chess(fenRef.current).isGameOver()) {
      return;
    }

    if (shouldCancelPremovesOnClick(square)) return;


    if (selectedSquare) {
      if (square === selectedSquare) {
        clearSelection();
        return;
      }

      if (legalMoves.includes(square)) {
        const color = capabilities.assignedColor
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

          if (capabilities.premoves && premovesEnabled) {
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

        if (capabilities.premoves) {
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

    if (capabilities.remoteMoves) {
      if (
        !canPlayerMove(gameMode, {
          piece: movingPiece,
          playerColor,
          turn: currentGame.turn(),
        })
      ) {
        return;
      }

      const sent = trySendOnlineMove(
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

        if (!capabilities.localMoves) {
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

      /*
       * Local games start from the standard position and have
       * no server-provided initial FEN. Set it lazily on the
       * first move so commitPosition has a base to replay from.
       */
      if (!gameStartFenRef.current) {
        gameStartFenRef.current = currentFen;
      }

      const uci =
        `${playedMove.from}${playedMove.to}` +
        `${playedMove.promotion ?? ''}`;

      commitPosition(currentGame.fen(), {
        uciMoves: [...uciHistoryRef.current, uci],
        animate: shouldAnimate
          ? { from, to, piece: movingPiece }
          : null,
        clearArrows: true,
      });

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

    const sent = trySendOnlineMove(
      move.from,
      move.to,
      move.promotion ?? '',
    );

    if (!sent) return;
    premoveSendingRef.current = true;
  }


  function queueOrPromptPremove(from, to) {
    if (!premovesEnabled) return;

    const piece = displayGame.get(from);
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
    if (new Chess(fenRef.current).isGameOver()) {
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

    const piece = displayGame.get(square);

    const color = capabilities.assignedColor
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
      !capabilities.premoves &&
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

    selectSquare(square);
  }

  function handlePointerMove(event) {
    if (isReviewing) return;

    if (
      !pointerDrag ||
      pointerDrag.pointerId !== event.pointerId
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
      !pointerDrag || pointerDrag.pointerId !== event.pointerId
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
      const color = capabilities.assignedColor
        ? playerColorRef.current
        : realGame.turn();

      const isOurTurn = realGame.turn() === color;

      const availableMoves = isOurTurn
        ? getLegalMovesForPiece(
            fenRef.current,
            pointerDrag.square,
          )
        : capabilities.premoves
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
        } else if (capabilities.premoves && premovesEnabled) {
          queueOrPromptPremove(
            pointerDrag.square,
            pointerDrag.destination,
          );
        }
      }
    }

    setPointerDrag(null);

    window.setTimeout(() => {
      suppressPieceClickRef.current = false;
    }, 0);
  }

  function handleArrowPointerDown(event) {
    if (event.button !== 2) return;

    const square = event.target.closest('[data-square]')?.dataset.square;
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


  function handlePointerCancel(event) {
    if (isReviewing) return;

    if ( pointerDrag?.pointerId === event.pointerId ) {
      setPointerDrag(null);
      suppressPieceClickRef.current =
        false;
    }
  }

  function handleBotStrengthChange(strength) {
    setBotGame((current) => ({ ...current, strength }));
  }

  function trySendOnlineMove(
    from,
    to,
    promotion = '',
  ) {
    const socket = socketRef.current;
    const currentGameId =
      gameIdRef.current;

    if ( socket?.readyState !== WebSocket.OPEN || !currentGameId) {
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
              setRightRailView('select-skin')
            }
          >
            Select Skin
          </button>

          <button
            className="account-button secondary"
            type="button"
            disabled={botGame.status === 'playing'}
            onClick={() => setRightRailView('game')}
          >
            VS Player
          </button>

          <button
            className="account-button secondary"
            type="button"
            onClick={() => setRightRailView(botGame.status === 'playing' ? 'game' : 'bot')}
          >
            Vs Bot
          </button>

          <button
            className="account-button secondary"
            type="button"
            onClick={() =>
              setRightRailView('info')
            }
          >
            Controls
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
                    color={ pointerDrag.piece.color }
                    type={ pointerDrag.piece.type }
                    skinFolder={getSkinFolderForColor(pointerDrag.piece.color)}
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
                  game={displayGame}
                  boardFiles={boardFiles}
                  boardRanks={boardRanks}
                  selectedSquare={selectedSquare}
                  lastMove={boardLastMove}
                  legalMoves={legalMoves}
                  draggingSquare={pointerDrag?.square ?? null}
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

      <aside className="right-rail" aria-label="Game controls and chat">
        <RightRail
          view={rightRailView}
          gameMode={gameMode}
          capabilities={capabilities}
          phase={phase}
          clockSnapshot={clockSnapshot}
          whiteTime={whiteTime}
          blackTime={blackTime}
          capturedPieces={capturedPieces}
          getSkinFolderForColor={getSkinFolderForColor}
          selectedTimeControl={selectedTimeControl}
          setSelectedTimeControl={setSelectedTimeControl}
          gameId={gameId}

          botGame={botGame}
          onBotStrengthChange={handleBotStrengthChange}
          playerColor={playerColor}
          gameStatus={gameStatus}
          skinFolders={skinFolders}
          selectedSkinFolder={selectedSkinFolder}
          selectedOpponentSkinFolder={selectedOpponentSkinFolder}
          selectingOpponentSkin={selectingOpponentSkin}
          onToggleSelectingOpponent={setSelectingOpponentSkin}
          onSelectSkinFolder={selectSkinFolder}
          socketReady={socketReady}
          cancellingMatchmaking={cancellingMatchmaking}
          premovesEnabled={premovesEnabled}
          onTogglePremoves={setPremovesEnabled}
          onPlay={handleOnlinePlay}
          onCancel={handleCancel}
          drawOffer={drawOffer}
          drawPending={drawPending}
          onDraw={handleDraw}
          onResign={handleResign}
          confirmResign={confirmResign}
          opponentGone={opponentGone}
          claimPending={claimPending}
          claimWinInSeconds={claimWinInSeconds}
          onClaimVictory={handleClaimVictory}
          moveHistory={moveHistory}
          reviewPly={reviewPly}
          onSelectPly={setReviewPly}

          onBotTakeback={handleBotTakeback}
          canBotTakeback={
            botGame.status === 'playing' && uciHistory.length > (playerColor === 'b' ? 1 : 0)
          }
          onPlayBot={handlePlayBot}
          onPlayAgain={handlePlayAgain}

          onBotColorModeChange={handleBotColorModeChange}
          chatMessages={chatMessages}
          chatText={chatText}
          chatError={chatError}
          onChatTextChange={handleChatTextChange}
          onChatSubmit={handleChatSubmit}
          chatMessagesRef={chatMessagesRef}
          uciHistory={uciHistory}
          onToggleHistory={() =>
            setRightRailView((current) =>
              current === 'history' ? 'game' : 'history',
            )
          }
          onStepBackward={stepBackward}
          onStepForward={stepForward}
          onReturnLive={() => setReviewPly(null)}
          canStepBackward={canStepBackward}
          canStepForward={canStepForward}
          isReviewing={isReviewing}
          takebackOffer={takebackOffer}
          takebackPending={takebackPending}
          gameRated={gameRated}
          onTakeback={handleTakeback}

        />
      </aside>
    </main>
  );
}

export default App;