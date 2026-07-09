import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useGame } from '../context/GameContext';
import QuizMode from '../components/QuizMode';
import JukeboxMode from '../components/JukeboxMode';
import PlayerList from '../components/PlayerList';

export default function GuestView() {
  const { sessionId } = useParams();
  const { socket } = useSocket();
  const game = useGame();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const searchTracks = () => {
    if (!searchQuery.trim()) return;
    socket.emit('guest:search', { query: searchQuery }, (res) => {
      setSearchResults(res.tracks || []);
    });
  };

  const addTrack = (track) => {
    socket.emit('guest:add-track', { track }, (res) => {
      if (res.error) return alert(res.error);
      setSearchResults([]);
      setSearchQuery('');
    });
  };

  const voteSkip = () => {
    socket.emit('guest:vote-skip', { trackId: game.currentTrack?.trackUri }, (res) => {
      if (res?.error) alert(res.error);
    });
  };

  const voteBoost = (trackId) => {
    socket.emit('guest:vote-boost', { trackId }, (res) => {
      if (res?.error) alert(res.error);
    });
  };

  const submitQuizAnswer = (answer) => {
    socket.emit('guest:quiz-answer', { answer }, () => {});
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>🎡 {sessionId}</h1>
        <div style={styles.points}>
          🪙 {game.playerPoints} points
        </div>
      </div>

      <PlayerList guests={game.guests} compact />

      {/* Mode Quiz */}
      {game.mode === 'MODE_QUIZ' && (
        <QuizMode
          round={game.quizRound}
          timer={game.quizTimer}
          onSubmit={submitQuizAnswer}
        />
      )}

      {/* Mode Jukebox */}
      {game.mode === 'MODE_JUKEBOX' && (
        <div>
          {/* Morceau en cours */}
          {game.currentTrack && (
            <div style={styles.nowPlaying}>
              <h3>▶ En cours</h3>
              <p style={styles.trackTitle}>{game.currentTrack.title}</p>
              <p style={styles.trackArtist}>{game.currentTrack.artist}</p>
              <div style={styles.actionRow}>
                <button style={styles.skipBtn} onClick={voteSkip}>
                  ⏭ SKIP (-30 pts)
                </button>
                <button style={styles.boostBtn} onClick={() => voteBoost(game.currentTrack.trackUri)}>
                  🚀 BOOST (-50 pts)
                </button>
              </div>
            </div>
          )}

          {/* Barre de recherche */}
          <div style={styles.searchBox}>
            <input
              style={styles.searchInput}
              placeholder="Chercher un morceau Spotify..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchTracks()}
            />
            <button style={styles.searchBtn} onClick={searchTracks}>
              🔍
            </button>
          </div>

          {/* Résultats */}
          {searchResults.length > 0 && (
            <div style={styles.results}>
              <h4>Résultats</h4>
              {searchResults.map(track => (
                <div key={track.id} style={styles.resultItem}>
                  <div>
                    <p style={styles.trackTitle}>{track.name}</p>
                    <p style={styles.trackArtist}>
                      {track.artists.map(a => a.name).join(', ')}
                      <span style={styles.albumName}> — {track.album.name}</span>
                    </p>
                  </div>
                  <button style={styles.addBtn} onClick={() => addTrack(track)}>
                    + 5pts
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {game.mode === 'MODE_LOBBY' && (
        <div style={styles.lobby}>
          <p>En attente que l'hôte lance la soirée...</p>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#0f0f23',
    color: 'white',
    fontFamily: 'system-ui, sans-serif',
    padding: '16px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: { fontSize: '1.3rem', margin: 0 },
  points: {
    background: '#ff6b35',
    padding: '6px 14px',
    borderRadius: '20px',
    fontWeight: 'bold',
    fontSize: '0.9rem',
  },
  nowPlaying: {
    background: '#1a1a3e',
    padding: '16px',
    borderRadius: '12px',
    marginBottom: '16px',
    textAlign: 'center',
    border: '1px solid #2a2a5e',
  },
  trackTitle: { fontSize: '1.2rem', fontWeight: 'bold', margin: '4px 0' },
  trackArtist: { color: '#8888aa', fontSize: '0.9rem', margin: '4px 0' },
  albumName: { color: '#6666aa' },
  actionRow: { display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '12px' },
  skipBtn: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: '1px solid #ff6b6b',
    background: 'transparent',
    color: '#ff6b6b',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  boostBtn: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: '1px solid #ffd700',
    background: 'transparent',
    color: '#ffd700',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  searchBox: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  searchInput: {
    flex: 1,
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #333',
    background: '#1a1a3e',
    color: 'white',
    fontSize: '1rem',
  },
  searchBtn: {
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    background: '#ff6b35',
    cursor: 'pointer',
    fontSize: '1.2rem',
  },
  results: {
    background: '#1a1a3e',
    padding: '12px',
    borderRadius: '12px',
    border: '1px solid #2a2a5e',
  },
  resultItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #2a2a5e',
  },
  addBtn: {
    padding: '6px 14px',
    borderRadius: '6px',
    border: '1px solid #ff6b35',
    background: 'transparent',
    color: '#ff6b35',
    cursor: 'pointer',
  },
  lobby: { textAlign: 'center', marginTop: '40px', color: '#8888aa' },
};