import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { useSocket } from '../context/SocketContext';

// Hook pour brancher les events socket → game context
export function useGameEvents() {
  const { socket } = useSocket();
  const game = useGame();
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket) return;

    // Quand on reçoit une update d'état
    const handleStateUpdate = (state) => {
      game.updateFromState(state);
    };

    const handleTrackSkipped = ({ trackId }) => {
      // Le morceau a été skip — le host peut avancer
      game.setCurrentTrack(null);
    };

    const handleQuizStart = ({ round, timer }) => {
      game.setQuizRound(round);
      game.setQuizTimer(timer);
    };

    const handleJukeboxOpen = () => {
      game.setMode('MODE_JUKEBOX');
    };

    socket.on('game:state-update', handleStateUpdate);
    socket.on('jukebox:track-skipped', handleTrackSkipped);
    socket.on('quiz:start', handleQuizStart);
    socket.on('jukebox:open', handleJukeboxOpen);
    socket.on('game:next-track', (track) => game.setCurrentTrack(track));

    return () => {
      socket.off('game:state-update', handleStateUpdate);
      socket.off('jukebox:track-skipped', handleTrackSkipped);
      socket.off('quiz:start', handleQuizStart);
      socket.off('jukebox:open', handleJukeboxOpen);
      socket.off('game:next-track');
    };
  }, [socket, game]);
}