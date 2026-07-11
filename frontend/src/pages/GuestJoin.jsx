import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useGame } from '../context/GameContext';
import { useNavigate } from 'react-router-dom';

const GENRES = ['Pop', 'Rock', 'Electronic', 'Hip-Hop / Rap', 'R&B / Soul', 'Jazz / Blues', 'Metal', 'Afrobeat / Dance', 'World / Reggae', 'Classique', 'Lo-fi / Chill', 'Indie / Alternative'];

export default function GuestJoin() {
  const { socket, connected } = useSocket();
  const game = useGame();
  const navigate = useNavigate();
  const { sessionId: sessionIdFromUrl } = useParams();
  const [sessionId, setSessionId] = useState(sessionIdFromUrl || '');
  const [username, setUsername] = useState('');
  const [step, setStep] = useState(1);
  const [likedGenres, setLikedGenres] = useState([]);
  const [hatedGenres, setHatedGenres] = useState([]);
  const [favoriteArtists, setFavoriteArtists] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  const handleJoin = () => {
    if (!sessionId) return setError('ID de session requis');
    if (!username) return setError('Pseudo requis');
    if (!connected) return setError('Connexion au serveur perdue');
    if (joining) return;

    setError('');
    setJoining(true);

    socket.emit('guest:join', {
      sessionId,
      username,
      likedGenres,
      hatedGenres,
      favoriteArtists: favoriteArtists.split(',').map(s => s.trim()).filter(Boolean),
    }, (res) => {
      setJoining(false);
      if (res?.error) return setError(res.error);
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
  
  const goBack = () => {
    setError('');
    setStep(1);
  };

  return (
    <div className="page">
      <div className="card">
        <div className="card-header">
          <div className="logo">Rejoindre la soirée</div>
          <div className="subtitle">{sessionId || 'Entrez un code de session'}</div>
        </div>

        {step === 1 && (
          <>
            <div className="field">
              <label className="label">Code de la session</label>
              <input className="input" value={sessionId}
                onChange={e => setSessionId(e.target.value)}
                placeholder="Ex: s-abcd1234" />
            </div>
            <div className="field">
              <label className="label">Pseudo</label>
              <input className="input" placeholder="Votre pseudo"
                value={username} onChange={e => setUsername(e.target.value)}
                maxLength={20} autoFocus />
            </div>
            {error && <div className="error">{error}</div>}
            <button className="btn btn-primary btn-full"
              onClick={() => setStep(2)}
              disabled={!username.trim()}>
              Continuer
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="field">
              <label className="label">Genres que j'aime</label>
              <div className="genre-grid">
                {GENRES.map(g => (
                  <div key={g} className={`genre-chip ${likedGenres.includes(g) ? 'genre-chip-liked' : ''}`}
                    onClick={() => toggleGenre(g, likedGenres, setLikedGenres)}>{g}</div>
                ))}
              </div>
            </div>
            <div className="field">
              <label className="label">Genres que je n'aime pas</label>
              <div className="genre-grid">
                {GENRES.map(g => (
                  <div key={g} className={`genre-chip ${hatedGenres.includes(g) ? 'genre-chip-hated' : ''}`}
                    onClick={() => toggleGenre(g, hatedGenres, setHatedGenres)}>{g}</div>
                ))}
              </div>
            </div>
            <div className="field">
              <label className="label">3 artistes favoris</label>
              <input className="input" placeholder="Séparés par des virgules"
                value={favoriteArtists} onChange={e => setFavoriteArtists(e.target.value)} />
            </div>
            {error && <div className="error">{error}</div>}
            
            <div className="action-row">
              <button className="btn btn-secondary" onClick={goBack}>
                ← Retour
              </button>
              <button className="btn btn-primary" onClick={handleJoin} disabled={joining}>
                {joining ? 'Connexion...' : 'Rejoindre'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
