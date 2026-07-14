import { createContext, useContext, useState, useCallback } from 'react';

// Game state global (sync via websocket events)
const GameContext = createContext(null);

export function useGame() {
  return useContext(GameContext);
}

export function GameProvider({ children }) {
  const [sessionId, setSessionId] = useState(null);
  const [username, setUsername] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [mode, setMode] = useState('MODE_LOBBY');
  const [guests, setGuests] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [playerPoints, setPlayerPoints] = useState(0);
  const [quizRound, setQuizRound] = useState(0);
  const [quizTimer, setQuizTimer] = useState(0);
  const [quizRevealed, setQuizRevealed] = useState(false);
  const [quizResults, setQuizResults] = useState(null);
  const [quizEndsAt, setQuizEndsAt] = useState(null);

  const updateFromState = useCallback((state) => {
    if (!state) return;
    setMode(state.mode);
    setGuests(state.guests || []);
    setQueue(state.queue || []);
    setCurrentTrack(state.currentTrack);
    setQuizRound(state.quizRound || 0);
    // Timer absolu : recalculé côté client à partir du timestamp serveur
    if (state.quizEndsAt) {
      setQuizEndsAt(state.quizEndsAt);
      setQuizTimer(Math.max(0, Math.round((state.quizEndsAt - Date.now()) / 1000)));
    }
    // Trouver les points du joueur courant
    if (username) {
      const me = (state.guests || []).find(g => g.username === username);
      if (me) setPlayerPoints(me.points);
    }
  }, [username]);

  const value = {
    sessionId, setSessionId,
    username, setUsername,
    isHost, setIsHost,
    mode, setMode,
    guests, setGuests,
    queue, setQueue,
    currentTrack, setCurrentTrack,
    playerPoints, setPlayerPoints,
    quizRound, setQuizRound,
    quizTimer, setQuizTimer,
    quizEndsAt, setQuizEndsAt,
    quizRevealed, setQuizRevealed,
    quizResults, setQuizResults,
    updateFromState,
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
}
