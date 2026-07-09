import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useGame } from '../context/GameContext';
import QRCodeComponent from '../components/QRCode';
import PlayerList from '../components/PlayerList';
import QueueDisplay from '../components/QueueDisplay';

export default function HostDashboard() {
  const { sessionId } = useParams();
  const { socket } = useSocket();
  const game = useGame();
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

  const ngrokUrlFinal = ngrokUrl || `${window.location.origin}?session=${sessionId}`;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>🎡 Roue de la Fortune</h1>
        <p style={styles.sessionId}>Session : {sessionId}</p>
      </div>

      {/* QR Code + Joueurs */}
      <div style={styles.topRow}>
        <div style={styles.qrBox}>
          <h3>📱 Scanner pour rejoindre</h3>
          <QRCodeComponent value={ngrokFinal} size={200} />
          <p style={styles.hint}>Ouvrir sur le smartphone</p>
        </div>

        <div style={styles.infoBox}>
          <h3>👥 Invités ({game.guests.length})</h3>
          <PlayerList guests={game.guests} />
        </div>
      </div>

      {/* Contrôles */}
      <div style={styles.controls}>
        {(game.mode === 'MODE_LOBBY') && (
          <button style={styles.bigBtn} onClick={startEvening}
            disabled={game.guests.length === 0}>
            🎬 LANCER LA SOIRÉE
          </button>
        )}

        {game.mode === 'MODE_QUIZ' && (
          <div>
            <div style={styles.quizBanner}>
              🔍 Blind-Test Round {game.quizRound} — Trouvez le morceau !
            </div>
            <button style={styles.secondaryBtn} onClick={startJukebox}>
              ⏭ Passer au Jukebox
            </button>
          </div>
        )}

        {game.mode === 'MODE_JUKEBOX' && (
          <button style={styles.bigBtn} onClick={nextTrack}
            disabled={game.queue.length === 0}>
            ⏭ Chanson suivante
          </button>
        )}
      </div>

      {/* File d'attente */}
      <div style={styles.queueSection}>
        <h2>🎵 File d'attente</h2>
        {game.currentTrack && (
          <div style={styles.nowPlaying}>
            ▶ En cours : <strong>{game.currentTrack.title}</strong> — {game.currentTrack.artist}
          </div>
        )}
        <QueueDisplay queue={game.queue} />
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#0f0f23',
    color: 'white',
    fontFamily: 'system-ui, sans-serif',
    padding: '20px',
  },
  header: { textAlign: 'center', marginBottom: '30px' },
  title: { fontSize: '2.5rem', margin: '0' },
  sessionId: { color: '#8888aa', fontSize: '0.9rem' },
  topRow: {
    display: 'flex',
    gap: '30px',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: '30px',
  },
  qrBox: {
    background: '#1a1a3e',
    padding: '20px',
    borderRadius: '12px',
    textAlign: 'center',
    border: '1px solid #2a2a5e',
  },
  hint: { color: '#8888aa', fontSize: '0.8rem', marginTop: '8px' },
  infoBox: {
    background: '#1a1a3e',
    padding: '20px',
    borderRadius: '12px',
    minWidth: '250px',
    border: '1px solid #2a2a5e',
  },
  controls: { textAlign: 'center', marginBottom: '30px' },
  bigBtn: {
    padding: '16px 40px',
    borderRadius: '12px',
    border: 'none',
    background: 'linear-gradient(135deg, #ff6b35, #ff3c3c)',
    color: 'white',
    fontSize: '1.3rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    opacity: 1,
    ':disabled': { opacity: 0.5 },
  },
  secondaryBtn: {
    padding: '12px 24px',
    borderRadius: '8px',
    border: '1px solid #4a4a8e',
    background: '#2a2a5e',
    color: 'white',
    fontSize: '1rem',
    cursor: 'pointer',
    marginTop: '12px',
  },
  quizBanner: {
    background: '#ff6b35',
    padding: '12px',
    borderRadius: '8px',
    fontWeight: 'bold',
    marginBottom: '12px',
  },
  queueSection: {
    background: '#1a1a3e',
    padding: '20px',
    borderRadius: '12px',
    border: '1px solid #2a2a5e',
  },
  nowPlaying: {
    background: '#2a2a5e',
    padding: '10px 16px',
    borderRadius: '8px',
    marginBottom: '12px',
    fontSize: '1.1rem',
  },
};