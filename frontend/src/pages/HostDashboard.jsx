import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useGame } from '../context/GameContext';
import { useGameEvents } from '../hooks/useGameEvents';
import QRCodeComponent from '../components/QRCode';
import PlayerList from '../components/PlayerList';
import QueueDisplay from '../components/QueueDisplay';

export default function HostDashboard() {
  const { sessionId } = useParams();
  const { socket } = useSocket();
  const game = useGame();
  useGameEvents();
  const [ngrokUrl, setNgrokUrl] = useState('');

  useEffect(() => {
    game.setSessionId(sessionId);
  }, [sessionId]);

  const startEvening = () => {
    socket.emit('host:start-evening', null, (res) => {
      if (res.error) alert(res.error);
    });
  };

  const startJukebox = () => {
    socket.emit('host:start-jukebox');
  };

  const nextTrack = () => {
    socket.emit('host:next-track');
  };

  const joinUrl = ngrokUrl || `${window.location.origin}/join?session=${sessionId}`;

  return (
    <div className="page">
      <div className="dashboard">
        {/* En-tête */}
        <div className="dash-header">
          <div>
            <div className="logo">Roue de la Fortune</div>
            <div className="session-tag">{sessionId}</div>
          </div>
          <div className="guest-count">{game.guests.length} participant{game.guests.length !== 1 ? 's' : ''}</div>
        </div>

        {/* Grille principale */}
        <div className="dash-grid">
          {/* QR Code + Lien */}
          <div className="panel">
            <div className="panel-title">Accès invités</div>
            <div className="qr-wrapper">
              <QRCodeComponent value={joinUrl} size={180} />
            </div>
            <div className="input-readonly">{joinUrl}</div>
          </div>

          {/* Participants */}
          <div className="panel">
            <div className="panel-title">Participants</div>
            <PlayerList guests={game.guests} compact />
          </div>

          {/* Contrôles */}
          <div className="panel panel-wide">
            <div className="panel-title">Contrôles</div>
            <div className="controls-row">
              {game.mode === 'MODE_LOBBY' && (
                <button className="btn btn-primary" onClick={startEvening}
                  disabled={game.guests.length === 0}>
                  Lancer la soirée
                </button>
              )}
              {game.mode === 'MODE_QUIZ' && (
                <>
                  <div className="badge badge-quiz">Blind-test Round {game.quizRound}</div>
                  <button className="btn btn-secondary" onClick={startJukebox}>
                    Passer au jukebox
                  </button>
                </>
              )}
              {game.mode === 'MODE_JUKEBOX' && (
                <button className="btn btn-primary" onClick={nextTrack}
                  disabled={game.queue.length === 0}>
                  Morceau suivant
                </button>
              )}
            </div>
          </div>
        </div>

        {/* En cours */}
        {game.currentTrack && (
          <div className="panel now-playing">
            <div className="now-label">EN COURS</div>
            <div className="now-title">{game.currentTrack.title}</div>
            <div className="now-artist">{game.currentTrack.artist}</div>
          </div>
        )}

        {/* File d'attente */}
        <div className="panel">
          <div className="panel-title">File d'attente ({game.queue.length})</div>
          <QueueDisplay queue={game.queue} />
        </div>
      </div>
    </div>
  );
}