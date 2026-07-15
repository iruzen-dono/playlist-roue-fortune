import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { useSocket } from '../context/SocketContext';

// Hook pour brancher les events socket → game context
export function useGameEvents() {
  const { socket } = useSocket();
  const game = useGame();

  useEffect(() => {
    if (!socket) return;

    const handleStateUpdate = (state) => {
      game.updateFromState(state);
    };

    const handleTrackSkipped = () => {
      game.setCurrentTrack(null);
    };

    const handleQuizStart = ({ round, timer, quizEndsAt }) => {
      game.setQuizLoading(false);
      game.setQuizRound(round);
      game.setQuizTimer(timer);
      game.setQuizResults(null);
      game.setQuizRevealed(false);
      if (quizEndsAt) game.setQuizEndsAt(quizEndsAt);
    };

    const handleQuizRevealed = ({ answer, results, round }) => {
      game.setQuizRevealed(true);
      game.setQuizResults({ answer, results, round });
    };

    const handleQuizLoading = () => {
      game.setQuizLoading(true);
    };

    const handleJukeboxOpen = () => {
      game.setMode('MODE_JUKEBOX');
    };

    const handleNextTrack = (track) => {
      game.setCurrentTrack(track);
    };

    socket.on('game:state-update', handleStateUpdate);
    socket.on('jukebox:track-skipped', handleTrackSkipped);
    socket.on('quiz:start', handleQuizStart);
    socket.on('quiz:loading', handleQuizLoading);
    socket.on('quiz:revealed', handleQuizRevealed);
    socket.on('jukebox:open', handleJukeboxOpen);
    socket.on('game:next-track', handleNextTrack);

    return () => {
      socket.off('game:state-update', handleStateUpdate);
      socket.off('jukebox:track-skipped', handleTrackSkipped);
      socket.off('quiz:start', handleQuizStart);
      socket.off('quiz:loading', handleQuizLoading);
      socket.off('quiz:revealed', handleQuizRevealed);
      socket.off('jukebox:open', handleJukeboxOpen);
      socket.off('game:next-track', handleNextTrack);
    };
  }, [socket]);
}
