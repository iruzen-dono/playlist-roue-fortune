import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useGame } from '../context/GameContext';

const GENRES = [
  { emoji: '🎤', label: 'Pop' },
  { emoji: '🎸', label: 'Rock' },
  { emoji: '🎹', label: 'Electronic' },
  { emoji: '🎧', label: 'Hip-Hop / Rap' },
  { emoji: '🎵', label: 'R&B / Soul' },
  { emoji: '🎶', label: 'Jazz / Blues' },
  { emoji: '🏋️', label: 'Metal' },
  { emoji: '💃', label: 'Afrobeat / Dance' },
  { emoji: '🌍', label: 'World / Reggae' },
  { emoji: '🎻', label: 'Classique / Acoustique' },
  { emoji: '🎛️', label: 'Lo-fi / Chill' },
  { emoji: '✨', label: 'Indie / Alternative' },
];

export default function GuestJoin() {
  const [searchParams] = useSearchParams();
  const { socket } = useSocket();
  const game = useGame();
  const navigate = useNavigate();

  const sessionFromUrl = searchParams.get('session') || '';
  const [step, setStep] = useState('pseudo');
  const [sessionId, setSessionId] = useState(sessionFromUrl);
  const [username, setUsername] = useState('');
  const [likedGenres, setLikedGenres] = useState([]);
  const [hatedGenres, setHatedGenres] = useState([]);
  const [favoriteArtists, setFavoriteArtists] = useState('');
  const [error, setError] = useState('');

  const handleJoin = () => {
    if (!sessionId) return setError('ID de session requis');
    if (!username) return setError('Pseudo requis');

    socket.emit('guest:join', {
      sessionId,
      username,
      likedGenres: likedGenres.map(g => g.label),
      hatedGenres: hatedGenres.map(g => g.label),
      favoriteArtists: favoriteArtists.split(',').map(s => s.trim()).filter(Boolean),
    }, (res) => {
      if (res.error) return setError(res.error);
      game.setSessionId(sessionId);
      game.setUsername(username);
      navigate(`/guest/${sessionId}`);
    });
  };

  const toggleGenre = (genre, list, setList) => {
    setList(prev =>
      prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🎡 Rejoindre la soirée</h1>

        {/* Step 1: Pseudo + Session */}
        {step === 'pseudo' && (
          <>
            <input
              style={styles.input}
              placeholder="ID de la session"
              value={sessionId}
              onChange={e => setSessionId(e.target.value)}
            />
            <input
              style={styles.input}
              placeholder="Ton pseudo"
              value={username}
              onChange={e => setUsername(e.target.value)}
              maxLength={20}
            />
            <button style={styles.button}
              onClick={() => setStep('genres')}>
              Suivant →
            </button>
          </>
        )}

        {/* Step 2: Genres */}
        {step === 'genres' && (
          <>
            <h3>🎯 Genres que tu aimes</h3>
            <div style={styles.genreGrid}>
              {GENRES.map(g => (
                <div key={g.label}
                  style={{
                    ...styles.genreChip,
                    ...(likedGenres.includes(g) ? styles.genreChipActive : {}),
                  }}
                  onClick={() => toggleGenre(g, likedGenres, setLikedGenres)}>
                  {g.emoji} {g.label}
                </div>
              ))}
            </div>

            <h3 style={{marginTop: '20px'}}>⛔ Genres que tu détestes</h3>
            <div style={styles.genreGrid}>
              {GENRES.map(g => (
                <div key={g.label}
                  style={{
                    ...styles.genreChip,
                    ...(hatedGenres.includes(g) ? styles.genreChipHated : {}),
                  }}
                  onClick={() => toggleGenre(g, hatedGenres, setHatedGenres)}>
                  {g.emoji} {g.label}
                </div>
              ))}
            </div>

            <input
              style={styles.input}
              placeholder="3 artistes favoris (séparés par des virgules)"
              value={favoriteArtists}
              onChange={e => setFavoriteArtists(e.target.value)}
            />

            <button style={styles.button}
              onClick={handleJoin}>
              🎵 Rejoindre la fête
            </button>
          </>
        )}

        {error && <p style={styles.error}>{error}</p>}
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
    fontFamily: 'system-ui, sans-serif',
    padding: '20px',
  },
  card: {
    background: '#1a1a3e',
    padding: '2rem',
    borderRadius: '12px',
    maxWidth: '500px',
    width: '100%',
    border: '1px solid #2a2a5e',
    color: 'white',
  },
  title: { textAlign: 'center', marginBottom: '1.5rem' },
  input: {
    display: 'block',
    width: '100%',
    padding: '12px',
    margin: '8px 0',
    borderRadius: '8px',
    border: '1px solid #333',
    background: '#0f0f23',
    color: 'white',
    fontSize: '1rem',
    boxSizing: 'border-box',
  },
  genreGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '8px',
  },
  genreChip: {
    background: '#2a2a5e',
    padding: '8px 14px',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    border: '1px solid transparent',
    transition: 'all 0.2s',
  },
  genreChipActive: {
    background: '#ff6b35',
    borderColor: '#ff3c3c',
  },
  genreChipHated: {
    background: '#5e2a2a',
    borderColor: '#ff3c3c',
    textDecoration: 'line-through',
  },
  button: {
    width: '100%',
    padding: '14px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #ff6b35, #ff3c3c)',
    color: 'white',
    fontSize: '1.1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '20px',
  },
  error: { color: '#ff6b6b', textAlign: 'center', marginTop: '12px' },
};