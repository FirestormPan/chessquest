import { useEffect, useRef, useState, useMemo  } from 'react';
import { Chess } from 'chess.js';
import { normalizeFen, parseUciMoves, makeMoveFromUci, getLegalMovesForPiece, applyMoves, getCapturedPieces, getMoveHistory, getCheckedKingSquare } from './boardRules'

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


function PieceVisual({ color, type, skinFolder, className = '' }) {
  const [failedImagePath, setFailedImagePath] = useState(null);

  if (!skinFolder) {
    return <span className={className}>{pieceSymbols[color][type]}</span>;
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
    <span className={className}>{pieceSymbols[color][type]}</span>
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
  isChecked
}) {
  return (
    <button
      className={`square ${isDark ? 'dark' : 'light'} ${
        isSelected ? 'selected' : ''
      } ${isLegalMove ? 'legal-move' : ''} ${
        isLastMove ? 'last-move' : ''
      } ${isChecked ? 'in-check' : ''} ${
        piece ? 'occupied' : ''
      }`}

      

      type="button"
      role="gridcell"
      data-square={square}
      aria-label={`${square}${piece ? `, ${piece.color === 'w' ? 'white' : 'black'} piece` : ''}${isLegalMove ? ', legal destination' : ''}`}
      onClick={() => onSquareClick(square)}
    >
      {piece && (
        <span
          className={`piece ${draggingSquare === square ? 'is-dragging' : ''}`}
          onClick={(event) => onPieceClick(event, square)}
          onPointerDown={(event) => onPointerDown(event, square)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <PieceVisual color={piece.color} type={piece.type} skinFolder={skinFolder} />
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
  suppressPieceClickRef,
  onSquareClick,
  onPieceClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onBoardClick,
  moveAnimation,
  onMoveAnimationEnd,
  pointerDrag,
  skinFolder,
  playerColor,
  opponentSkinFolder,
  checkedSquare
}) {
  const skinColor = playerColor ?? 'w';

  return (
    <div className="board" role="grid" aria-label="Interactive chessboard" onClick={onBoardClick}>
      {boardRanks.flatMap((rank, rankIndex) =>
        boardFiles.map((file, fileIndex) => {
          const square = `${file}${rank}`;
          const piece = game.get(square);
          const displayedPiece = moveAnimation?.to === square ? null : piece;
          const isDark = (rankIndex + fileIndex) % 2 === 1;
          const isLastMove =  lastMove?.from === square || lastMove?.to === square;
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
              skinFolder={piece?.color === skinColor ? skinFolder : opponentSkinFolder}
            />
          );
        }),
      )}
      {moveAnimation && (
        <div
          className="move-animation"
          style={getSquarePosition(
            moveAnimation.phase === 'destination' ? moveAnimation.to : moveAnimation.from,
            boardFiles,
            boardRanks,
          )}
          onTransitionEnd={onMoveAnimationEnd}
          aria-hidden="true"
        >
          <PieceVisual
            color={moveAnimation.piece.color}
            type={moveAnimation.piece.type}
            skinFolder={moveAnimation.piece.color === skinColor ? skinFolder : opponentSkinFolder}
          />
        </div>
      )}
    </div>
  );
}

function App() {
  const socketRef = useRef(null);
  const initialFenRef = useRef(null);
  const playerColorRef = useRef(null);
  const moveCountRef = useRef(0);
  const suppressPieceClickRef = useRef(false);
  const selectedSquareRef = useRef(null);
  const boardFrameRef = useRef(null);
  const animationTimerRef = useRef(null);

  const [fen, setFen] = useState(() => new Chess().fen());
  const fenRef = useRef(fen);
  const [lastMove, setLastMove] = useState(null);
  const [moveAnimation, setMoveAnimation] = useState(null);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [draggingSquare, setDraggingSquare] = useState(null);
  const [pointerDrag, setPointerDrag] = useState(null);
  const [account, setAccount] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [gameId, setGameId] = useState(null);
  const [matchmaking, setMatchmaking] = useState(false);
  const [cancellingMatchmaking, setCancellingMatchmaking] = useState(false);
  const [gameStatus, setGameStatus] = useState('');
  const [playerColor, setPlayerColor] = useState(null);
  const [socketReady, setSocketReady] = useState(false);
  const [capturedPieces, setCapturedPieces] = useState({ w: [], b: [] });
  const [rightRailView, setRightRailView] = useState('game');
  const [skinFolders, setSkinFolders] = useState([]);
  const [selectedSkinFolder, setSelectedSkinFolder] = useState('alteon');
  const [selectedOpponentSkinFolder, setSelectedOpponentSkinFolder] = useState('evil');
  const [selectingOpponentSkin, setSelectingOpponentSkin] = useState(false);
  const [clockSnapshot, setClockSnapshot] = useState(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [promotionChoice, setPromotionChoice] = useState(null);
  const [promotionPopupStyle, setPromotionPopupStyle] = useState({ left: 0, top: 0 });
  const [drawOffer, setDrawOffer] = useState(false);
  const [drawPending, setDrawPending] = useState(false);
  const drawPendingRef = useRef(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [chatError, setChatError] = useState('');
  const chatMessagesRef = useRef(null);
  const [moveHistory, setMoveHistory] = useState([]);


  const game = useMemo(() => new Chess(fen), [fen]);
  const checkedSquare = getCheckedKingSquare(fen);
  const boardFiles = playerColor === 'b' ? [...files].reverse() : files;
  const boardRanks = playerColor === 'b' ? [...ranks].reverse() : ranks;
  const elapsed = clockSnapshot?.status === 'started' ? clockNow - clockSnapshot.updatedAt : 0;
  const whiteTime = clockSnapshot?.wtime == null ? 0 : clockSnapshot.wtime - (clockSnapshot.turn === 'w' ? elapsed : 0);
  const blackTime = clockSnapshot?.btime == null ? 0 : clockSnapshot.btime - (clockSnapshot.turn === 'b' ? elapsed : 0);

  function getSkinFolderForColor(color) {
    const skinColor = playerColor ?? 'w';
    return color === skinColor ? selectedSkinFolder : selectedOpponentSkinFolder;
  }

  function selectSkinFolder(folder) {
  if (selectingOpponentSkin) {
    // Clicking the already-selected opponent skin deselects it.
    if (selectedOpponentSkinFolder === folder) {
      setSelectedOpponentSkinFolder(null);
      return;
    }

    // A skin selected for the player cannot be selected for the opponent.
    if (selectedSkinFolder === folder) return;

    setSelectedOpponentSkinFolder(folder);
    return;
  }

  // Clicking the already-selected player skin deselects it.
  if (selectedSkinFolder === folder) {
    setSelectedSkinFolder(null);
    return;
  }

  // A skin selected for the opponent cannot be selected for the player.
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
    setMoveAnimation({ from, to, piece, phase: 'source' });
    window.requestAnimationFrame(() => {
      setMoveAnimation((current) => current && { ...current, phase: 'destination' });
    });
    animationTimerRef.current = window.setTimeout(() => setMoveAnimation(null), 280);
  }

  function finishMoveAnimation() {
    window.clearTimeout(animationTimerRef.current);
    setMoveAnimation(null);
  }

  function closePromotionChoice() {
    setPromotionChoice(null);
  }

  function handleResign() {
    if (!gameId || socketRef.current?.readyState !== WebSocket.OPEN) return;
    if (!window.confirm('Resign this game?')) return;

    socketRef.current.send(JSON.stringify({ type: 'game.resign', gameId }));
    setGameStatus('Resigning game...');
  }

  function handleDraw() {
    if (!gameId || socketRef.current?.readyState !== WebSocket.OPEN) return;

    const accepting = drawOffer;
    socketRef.current.send(JSON.stringify({ type: 'game.draw', gameId, accept: accepting }));
    if (!accepting) {
      drawPendingRef.current = true;
      setDrawPending(true);
    } else {
      setDrawOffer(false);
    }
    setGameStatus(accepting ? 'Accepting draw...' : 'Draw offered');
  }

  function handleChatSubmit(event) {
    event.preventDefault();
    const text = chatText.trim();
    if (!gameId || !text || text.length > 140 || socketRef.current?.readyState !== WebSocket.OPEN) return;

    setChatError('');
    socketRef.current.send(JSON.stringify({ type: 'game.chat', gameId, room: 'player', text }));
    setChatText('');
  }


  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setAccount(data?.account ?? null))
      .catch(() => setAccount(null))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/skins')
      .then((response) => (response.ok ? response.json() : { skins: [] }))
      .then((data) => {
        const folders = Array.isArray(data.skins) ? data.skins : [];
        setSkinFolders(folders);
        if (folders.length && !folders.includes(selectedSkinFolder)) {
          setSelectedSkinFolder(folders[0]);
        }
      })
      .catch(() => setSkinFolders([]));
  }, []);

  useEffect(() => {
    if (!clockSnapshot || clockSnapshot.status !== 'started') return undefined;

    const interval = window.setInterval(() => setClockNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [clockSnapshot]);

  useEffect(() => {
    chatMessagesRef.current?.scrollTo({ top: chatMessagesRef.current.scrollHeight });
  }, [chatMessages]);

  useEffect(() => {
    if (!promotionChoice || !boardFrameRef.current) return undefined;

    const squareElement = boardFrameRef.current.querySelector(`[data-square="${promotionChoice.to}"]`);
    if (!squareElement) return undefined;

    const squareRect = squareElement.getBoundingClientRect();

    setPromotionPopupStyle({
      left: squareRect.left + squareRect.width / 2,
      top: squareRect.top + squareRect.height / 2,
    });

    return undefined;
  }, [promotionChoice, fen, boardFiles, boardRanks]);

  useEffect(() => {
    if (!account) {
      setSocketReady(false);
      return undefined;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
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
        setGameStatus('Received an invalid message from the game server');
        return;
      }

      if (payload.type === 'game.found') {
        setGameId(payload.gameId);
        setMatchmaking(false);
        setGameStatus('Game found');
        return;
      }

      if (payload.type === 'error') {
        if (payload.scope === 'chat') setChatError(payload.message);
        if (payload.message === 'Draw request was rejected') {
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
          setGameStatus(payload.message ?? 'Draw request was rejected');
        }
        return;
      }

      if (payload.type === 'game.chat.error') {
        setChatError(payload.message);
        return;
      }

      if (payload.type === 'game.chat.sent') {
        setChatMessages((current) => {
          const alreadyShown = current.some((message) => (
            message.room === payload.room
            && message.username === account.username
            && message.text === payload.text
          ));
          return alreadyShown
            ? current
            : [...current, { room: payload.room, username: account.username, text: payload.text }];
        });
        return;
      }

      if (payload.type !== 'game.event') return;

      const event = payload.event;

      if (event.type === 'chatLine') {
        setChatMessages((current) => {
          const alreadyShown = current.some((message) => (
            message.room === event.room
            && message.username === event.username
            && message.text === event.text
          ));
          return alreadyShown ? current : [...current, event];
        });
        return;
      }

      if (event.type === 'gameFull') {
        initialFenRef.current = event.initialFen;
        const color = event.white?.id?.toLowerCase() === account.username?.toLowerCase() ? 'w' : 'b';
        const nextFen = applyMoves(event.initialFen, event.state.moves);
        const moves = parseUciMoves(event.state.moves);
        setMoveHistory(getMoveHistory(event.initialFen, event.state.moves));

        const lastUciMove = moves[moves.length - 1];
        moveCountRef.current = moves.length;

        setLastMove(
          lastUciMove
            ? {
                from: lastUciMove.slice(0, 2),
                to: lastUciMove.slice(2, 4),
              }
            : null
        );



        setPlayerColor(color);
        playerColorRef.current = color;
        setDrawOffer(false);
        drawPendingRef.current = false;
        setDrawPending(false);
        setChatMessages(Array.isArray(event.chat) ? event.chat : []);
        setChatError('');
        fenRef.current = nextFen;
        setFen(nextFen);
        setCapturedPieces(getCapturedPieces(event.initialFen, event.state.moves));
        setClockSnapshot({
          wtime: clockValue(event.state.wtime),
          btime: clockValue(event.state.btime),
          winc: clockValue(event.clock?.increment) ?? 0,
          binc: clockValue(event.clock?.increment) ?? 0,
          turn: new Chess(nextFen).turn(),
          status: event.state.status,
          updatedAt: Date.now(),
        });
        setGameStatus('Game in progress');
        return;
      }

  if (event.type === 'gameState' && initialFenRef.current) {
  const nextFen = applyMoves(
    initialFenRef.current,
    event.moves
  );

  const moves = parseUciMoves(event.moves);
  const lastUciMove = moves[moves.length - 1];

  const newMoves = moves.slice(moveCountRef.current);
  const moveWasMade = newMoves.length > 0;
  moveCountRef.current = moves.length;
  const ownDrawOffer = playerColorRef.current === 'w' ? event.wdraw : event.bdraw;
  const opponentDrawOffer = playerColorRef.current === 'w' ? event.bdraw : event.wdraw;
  if (moveWasMade) {
    drawPendingRef.current = false;
    setDrawPending(false);
    setDrawOffer(false);
  } else {
    if (drawPendingRef.current && !ownDrawOffer) {
      drawPendingRef.current = false;
      setDrawPending(false);
      setGameStatus('Draw offer refused');
    }
    setDrawOffer(Boolean(opponentDrawOffer));
  }

  setMoveHistory(
    getMoveHistory(initialFenRef.current, event.moves)
  );



  setLastMove(
    lastUciMove
      ? {
          from: lastUciMove.slice(0, 2),
          to: lastUciMove.slice(2, 4),
        }
      : null
  );

  if (newMoves.length) {
    const newCapturedPieces = getCapturedPieces(fenRef.current, newMoves);
    if (newCapturedPieces.w.length || newCapturedPieces.b.length) {
      setCapturedPieces((current) => ({
        w: [...current.w, ...newCapturedPieces.w],
        b: [...current.b, ...newCapturedPieces.b],
      }));
    }
  }
  fenRef.current = nextFen;
  setFen(nextFen);
  if (selectedSquareRef.current) {
    const updatedMoves = getLegalMovesForPiece(nextFen, selectedSquareRef.current);
    if (updatedMoves.length > 0) {
      setLegalMoves(updatedMoves.map((move) => move.to));
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
    setGameStatus(`Game ${event.status}`);
    setGameId(null);
    clearSelection();
  }
}

    };

    socket.onerror = () => {
      if (socketRef.current === socket) setGameStatus('Game server connection failed');
    };
    socket.onclose = () => {
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      setSocketReady(false);
      setGameStatus('Game server disconnected');
    };

    return () => {
      setSocketReady(false);
      socket.close();
    };
  }, [account]);

  function handlePlay() {
    if (!socketReady || socketRef.current?.readyState !== WebSocket.OPEN) {
      setGameStatus('Game server is not connected');
      return;
    }

    const newGame = new Chess();
    fenRef.current = newGame.fen();
    setFen(fenRef.current);
    setCapturedPieces({ w: [], b: [] });
    setClockSnapshot(null);
    initialFenRef.current = null;
    playerColorRef.current = null;
    moveCountRef.current = 0;
    drawPendingRef.current = false;
    setGameId(null);
    setPlayerColor(null);
    setLastMove(null);
    setDrawOffer(false);
    setDrawPending(false);
    setChatMessages([]);
    setChatText('');
    setChatError('');
    clearSelection();
    closePromotionChoice();
    setMatchmaking(true);
    setGameStatus('Searching for an opponent...');

    fetch('/api/game/start', { method: 'POST', credentials: 'include' })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error ?? 'Unable to start game search');
      })
      .catch((error) => {
        setMatchmaking(false);
        setGameStatus(error.message);
      });
  }

  async function handleCancel() {
    setCancellingMatchmaking(true);
    try {
      const response = await fetch('/api/game/cancel', {
        method: 'POST',
        credentials: 'include',
      });
      const data = response.status === 204 ? {} : await response.json();
      if (!response.ok && response.status !== 404) {
        throw new Error(data.error ?? 'Unable to cancel game search');
      }
      setMatchmaking(false);
      setGameStatus('Game search cancelled');
    } catch (error) {
      setGameStatus(error.message);
    } finally {
      setCancellingMatchmaking(false);
    }
  }

  function handleLogin() {
    window.location.assign('/api/auth/lichess');
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      setAccount(null);
    } catch {
      // ignore logout errors and keep the UI responsive
    }
  }

  function selectSquare(square) {
    const piece = game.get(square);
    if (gameId && (
      !piece
      || piece.color !== playerColor
      || game.turn() !== playerColor
    )) {
      clearSelection();
      return;
    }

    const moves = getLegalMovesForPiece(fen, square);
    if (moves.length === 0) {
      clearSelection();
      return;
    }

    selectedSquareRef.current = square;
    setSelectedSquare(square);
    setLegalMoves(moves.map((move) => move.to));
  }

  function handleSquareClick(square) {
    if (promotionChoice) {
      closePromotionChoice();
      return;
    }

    if (selectedSquare) {
      if (square === selectedSquare) {
        clearSelection();
        return;
      }

      if (legalMoves.includes(square)) {
        const selectedPiece = game.get(selectedSquare);
        const canMove = !gameId || (
          selectedPiece?.color === playerColor && game.turn() === playerColor
        );
        if (!canMove) return;
        makeMove(selectedSquare, square);
        return;
      }
    }

    selectSquare(square);
  }

  function handlePieceClick(event, square) {
    event.stopPropagation();
    if (suppressPieceClickRef.current) {
      suppressPieceClickRef.current = false;
      return;
    }
    handleSquareClick(square);
  }

  function makeMove(from, to, promotion = '', shouldAnimate = true) {
    const movingPiece = game.get(from);
    const shouldPromptPromotion = movingPiece?.type === 'p' && ['1', '8'].includes(to[1]) && !promotion;

    if (shouldPromptPromotion) {
      setPromotionChoice({ from, to, color: movingPiece.color });
      return;
    }

    if (gameId) {
      if (!movingPiece || movingPiece.color !== playerColor || game.turn() !== playerColor) return;

      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        setDrawOffer(false);
        socket.send(JSON.stringify({
          type: 'game.move',
          gameId,
          uci: `${from}${to}${promotion}`,
        }));
      }
      closePromotionChoice();
      clearSelection();
      return;
    }

    const nextGame = new Chess(fen);

    try {
      const playedMove = nextGame.move({ from, to, promotion });
      if (shouldAnimate) animateMove(from, to, movingPiece);
      setLastMove({
        from: playedMove.from,
        to: playedMove.to,
      });
      fenRef.current = nextGame.fen();
      setFen(fenRef.current);

      //calculate captured pieces and update state (derived)
      if (playedMove.captured) {
        setCapturedPieces((current) => ({
          ...current,
          [playedMove.color === 'w' ? 'b' : 'w']: [
            ...current[playedMove.color === 'w' ? 'b' : 'w'],
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

  function handlePromotionChoice(pieceType) {
    if (!promotionChoice) return;
    makeMove(promotionChoice.from, promotionChoice.to, pieceType);
  }

  function handlePointerDown(event, square) {
    if (selectedSquare && square !== selectedSquare && legalMoves.includes(square)) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    suppressPieceClickRef.current = true;
    setPointerDrag({
      pointerId: event.pointerId,
      square,
      destination: square,
      moved: false,
      clientX: event.clientX,
      clientY: event.clientY,
      piece: game.get(square),
    });
    setDraggingSquare(square);
    selectSquare(square);
  }

  function handlePointerMove(event) {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;

    const destination = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-square]')?.dataset.square;

    if (destination) {
      setPointerDrag((current) => ({
        ...current,
        destination,
        clientX: event.clientX,
        clientY: event.clientY,
        moved: current.moved || destination !== current.square,
      }));
    }
  }

  function handlePointerUp(event) {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;

    event.currentTarget.releasePointerCapture(event.pointerId);

    if (pointerDrag.moved) {
      const canMove = getLegalMovesForPiece(fen, pointerDrag.square)
        .some((move) => move.to === pointerDrag.destination);
      if (canMove) makeMove(pointerDrag.square, pointerDrag.destination, '', false);
    }

    setPointerDrag(null);
    setDraggingSquare(null);
    window.setTimeout(() => {
      suppressPieceClickRef.current = false;
    }, 0);
  }

  function handlePointerCancel(event) {
    if (pointerDrag?.pointerId === event.pointerId) {
      setPointerDrag(null);
      setDraggingSquare(null);
      suppressPieceClickRef.current = false;
    }
  }

  return (
    <main className="app-shell">
      <section className="intro-panel" aria-labelledby="page-title">
        <h2>Chess Quest</h2>

        <div className="account-panel">
          {authLoading ? (
            <span className="account-status">Checking account...</span>
          ) : account ? (
            <>
              <span className="account-status">
                Connected as <strong>{account.username}</strong> 
                ({account.perfs.rapid.rating || 'unrated'})
              </span>
              <button className="account-button secondary" type="button" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <button className="account-button" type="button" onClick={handleLogin}>
              Connect Lichess
            </button>
          )}
        </div>

        <div className="account-panel" aria-label="Right rail view">
          <button className="account-button secondary" type="button" onClick={() => setRightRailView('hello')}>
            Select Skin
          </button>
          <button className="account-button secondary" type="button" onClick={() => setRightRailView('game')}>
            Show game and chat
          </button>
          <button
            className="account-button secondary"
            type="button"
            onClick={() => setRightRailView('out-of-game')}
            disabled={Boolean(gameStatus=='Game in progress' || gameStatus=='Searching for an opponent...' || gameStatus=='Draw offered')}
          >
            Out of game
          </button>
        </div>

        {gameStatus && (
          <p className="game-status" aria-live="polite">
            {gameStatus}
          </p>
        )}
      </section>

      <section className="board-panel" aria-label="Chessboard sandbox">
        <div className="board-game-area">
          <div className="board-frame" ref={boardFrameRef}>
            {promotionChoice && (
              <div
                className="promotion-popup"
                role="dialog"
                aria-label="Choose a promotion piece"
                style={{ left: `${promotionPopupStyle.left}px`, top: `${promotionPopupStyle.top}px` }}
                onClick={(event) => event.stopPropagation()}
              >
                {promotionOptions.map((pieceType) => (
                  <button
                    key={pieceType}
                    type="button"
                    className="promotion-option"
                    onClick={(event) => {
                      event.stopPropagation();
                      handlePromotionChoice(pieceType);
                    }}
                    aria-label={`Promote pawn to ${getPromotionLabel(pieceType)}`}
                  >
                    <PieceVisual
                      color={promotionChoice.color}
                      type={pieceType}
                      skinFolder={getSkinFolderForColor(promotionChoice.color)}
                      className="promotion-piece"
                    />
                  </button>
                ))}
              </div>
            )}

              {pointerDrag?.moved && pointerDrag.piece && (
                <div
                  className="piece dragged-piece"
                  style={{
                    left: pointerDrag.clientX,
                    top: pointerDrag.clientY,
                  }}
                >
                  <PieceVisual
                    color={pointerDrag.piece.color}
                    type={pointerDrag.piece.type}
                    skinFolder={getSkinFolderForColor(pointerDrag.piece.color)}
                  />
                </div>
              )}






            <div className="board-layout">
              <div className="rank-labels" aria-hidden="true">
                {boardRanks.map((rank) => (
                  <span key={rank}>{rank}</span>
                ))}
              </div>

              <div className="board-column">
                <ChessBoard
                  game={game}
                  boardFiles={boardFiles}
                  boardRanks={boardRanks}
                  selectedSquare={selectedSquare}
                  lastMove={lastMove}
                  legalMoves={legalMoves}
                  draggingSquare={draggingSquare}
                  suppressPieceClickRef={suppressPieceClickRef}
                  onSquareClick={handleSquareClick}
                  onPieceClick={handlePieceClick}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  onBoardClick={() => {
                    if (promotionChoice) {
                      closePromotionChoice();
                    }
                  }}
                  moveAnimation={moveAnimation}
                  onMoveAnimationEnd={finishMoveAnimation}
                  pointerDrag={pointerDrag}
                  skinFolder={selectedSkinFolder}
                  playerColor={playerColor}
                  opponentSkinFolder={selectedOpponentSkinFolder}
                  checkedSquare={checkedSquare}
                />

                <div className="file-labels" aria-hidden="true">
                  {boardFiles.map((file) => (
                    <span key={file}>{file}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          

        </div>
        
      </section>







      <aside className="right-rail" aria-label="Game controls and chat">
  {(() => {
    switch (rightRailView) {
      case 'hello':
        return (
          <div className="skin-picker" aria-label="Choose a piece skin">
            <div className="skin-picker-heading">
              <span className="chat-kicker">Piece skins</span>
              <h2>Choose a set</h2>
              <label className="skin-opponent-toggle">
                <input
                  type="checkbox"
                  checked={selectingOpponentSkin}
                  onChange={(event) => setSelectingOpponentSkin(event.target.checked)}
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
                  onClick={() => selectSkinFolder(folder)}
                  disabled={ selectingOpponentSkin ? selectedSkinFolder === folder : selectedOpponentSkinFolder === folder }
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
            {!skinFolders.length && <p className="skin-empty">No piece skins found.</p>}
          </div>
        );

      case 'out-of-game':
        return <div>out of game</div>;

      default:
        return (
          <>
            {clockSnapshot?.wtime != null &&
              clockSnapshot?.btime != null && (
                <div className="clock-panel" aria-label="Time remaining">
                  <div
                    className={`clock-card ${
                      clockSnapshot.turn === 'w' ? 'active' : ''
                    } ${whiteTime < 30000 ? 'low-time' : ''}`}
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
                            <PieceVisual color="b" type={piece} skinFolder={getSkinFolderForColor('b')} />
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div
                    className={`clock-card ${
                      clockSnapshot.turn === 'b' ? 'active' : ''
                    } ${blackTime < 30000 ? 'low-time' : ''}`}
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
                            <PieceVisual color="w" type={piece} skinFolder={getSkinFolderForColor('w')} />
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

            <div className="game-actions" aria-label="Game actions">
              <button
                className="account-button"
                type="button"
                onClick={matchmaking ? handleCancel : handlePlay}
                disabled={
                  !socketReady ||
                  cancellingMatchmaking ||
                  (!matchmaking && Boolean(gameId))
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
                    disabled={drawPending && !drawOffer}
                  >
                    {drawOffer
                      ? 'Accept draw'
                      : drawPending
                        ? 'Draw offered'
                        : 'Offer draw'}
                  </button>

                  <button
                    className="account-button danger"
                    type="button"
                    onClick={handleResign}
                  >
                    Resign
                  </button>
                </>
              )}
            </div>

           <div className="chat-panel" aria-label="Game chat and move history">
  <div className="chat-header">
    
    <div>
      <span className="chat-kicker">Lichess</span>
      <h2>
        {rightRailView === 'history' ? 'Move history' : 'Game chat'}
      </h2>
    </div>

     <button
      className="account-button secondary"
      type="button"
      onClick={() =>
        setRightRailView((current) =>
          current === 'history' ? 'game' : 'history'
        )
      }
      aria-pressed={rightRailView === 'history'}
    >
      {rightRailView === 'history' ? 'Chat' : 'History'}
    </button>
  </div>

  {rightRailView === 'history' ? (
    <div className="move-history">
      {moveHistory.length === 0 ? (
        <p className="chat-empty">
          No moves yet.
        </p>
      ) : (
        moveHistory
          .reduce((rows, move) => {
            if (move.color === 'w') {
              rows.push({
                number: move.number,
                white: move.san,
                black: '',
              });
            } else if (rows.length) {
              rows[rows.length - 1].black = move.san;
            }

            return rows;
          }, [])
          .map((move) => (
            <div className="history-row" key={move.number}>
              <span>{move.number}. </span>
              <span>{move.white}</span>
              <span> | {move.black}</span>
            </div>
          ))
      )}
    </div>
  ) : (
    <>
      <div
        className="chat-messages"
        ref={chatMessagesRef}
        aria-live="polite"
      >
        {!gameId && (
          <p className="chat-empty">
            Join a game to chat.
          </p>
        )}

        {gameId && chatMessages.length === 0 && (
          <p className="chat-empty">
            No messages yet.
          </p>
        )}

        {chatMessages.map((message, index) => (
          <div
            className="chat-message"
            key={`${message.username}-${message.text}-${index}`}
          >
            <strong>{message.username}</strong>
            <span>{message.text}</span>
          </div>
        ))}
      </div>

      <form
        className="chat-form"
        onSubmit={handleChatSubmit}
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
          disabled={!gameId || !socketReady}
          onChange={(event) => {
            setChatText(event.target.value);
            if (chatError) setChatError('');
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
        <span>{chatText.length}/140</span>

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
