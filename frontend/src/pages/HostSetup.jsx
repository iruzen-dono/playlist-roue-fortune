import { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useGame } from '../context/GameContext';
import { useNavigate } from 'react-router-dom';

export default function HostSetup() {
  const { socket } = useSocket();
  const game = useGame();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [sessionId, setSessionId] = useState(`soiree-${Date.now()}`);
  const [error, setError] = useState('');

  const createSession = () => {
    if (!password) return setError('Mot de passe requis');
    socket.emit('host:create-session', { sessionId, password }, (res) => {
      if (res.error) return setError(res.error);
      game.setSessionId(sessionId);
      game.setIsHost(true);
      navigate(`/host/${sessionId}`);
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🎡 Playlist Roue de la Fortune</h1>
        <p style={styles.subtitle}>Configurez votre soirée musicale</p>

        <input
          style={styles.input}
          placeholder="ID de la session"
          value={sessionId}
          onChange={e => setSessionId(e.target.value)}
        />

        <input
          style={styles.input}
          type="password"
          placeholder="Mot de passe hôte"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.button} onClick={createSession}>
          🚀 Créer la soirée
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f0f23',
    color: 'white',
    fontFamily: 'system-ui, sans-serif',
  },
  card: {
    background: '#1a1a3e',
    padding: '3rem',
    borderRadius: '16px',
    textAlign: 'center',
    maxWidth: '400px',
    width: '90%',
    border: '1px solid #2a2a5e',
  },
  title: { fontSize: '2rem', margin: '0 0 0.5rem' },
  subtitle: { color: '#8888aa', marginBottom: '2rem' },
  input: {
    display: 'block',
    width: '100%',
    padding: '12px',
    margin: '12px 0',
    borderRadius: '8px',
    border: '1px solid #333',
    background: '#2a2a5e',
    color: 'white',
    fontSize: '1rem',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    padding: '14px',
    marginTop: '12px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #ff6b35, #ff3c3c)',
    color: 'white',
    fontSize: '1.1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  error: { color: '#ff6b6b', fontSize: '0.9rem' },
};