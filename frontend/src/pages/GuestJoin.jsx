import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useGame } from '../context/GameContext';
import { useNavigate } from 'react-router-dom';

const MOODS = [
  { id: 'chill', label: 'Chill', emoji: '🧘' },
  { id: 'balanced', label: 'Balance', emoji: '⚖️' },
  { id: 'energetic', label: 'Dansant', emoji: '🕺' },
];

export default function GuestJoin() {
  const { socket, connected } = useSocket();
  const game = useGame();
  const navigate = useNavigate();
  const { sessionId: sessionIdFromUrl } = useParams();
  const [sessionId, setSessionId] = useState(sessionIdFromUrl || '');
  const [username, setUsername] = useState('');
  const [step, setStep] = useState(1);
  const [likedArtists, setLikedArtists] = useState([]);
  const [mood, setMood] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [curatedArtists, setCuratedArtists] = useState([]);
  const [loadingArtists, setLoadingArtists] = useState(false);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  // Charger la liste curated au step 2
  useEffect(() => {
    if (step !== 2) return;
    setLoadingArtists(true);
    fetch('/api/curated-artists')
      .then(r => r.json())
      .then(data => {
        setCuratedArtists(data.artists || []);
        setLoadingArtists(false);
      })
      .catch(() => setLoadingArtists(false));
  }, [step]);

  const toggleArtist = useCallback((artist) => {
    setLikedArtists(prev => {
      const exists = prev.find(a => a.id === artist.id);
      if (exists) return prev.filter(a => a.id !== artist.id);
      if (prev.length >= 5) return prev;
      return [...prev, artist];
    });
  }, []);

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) return;
    fetch(`/api/search-artists?q=${encodeURIComponent(searchQuery.trim())}`)
      .then(r => r.json())
      .then(data => {
        if (data.artist) {
          setSearchResults([data.artist]);
        } else {
          setSearchResults([]);
        }
      })
      .catch(() => setSearchResults([]));
  }, [searchQuery]);

  const addSearchedArtist = useCallback((artist) => {
    toggleArtist(artist);
    setSearchQuery('');
    setSearchResults([]);
  }, [toggleArtist]);

  const handleJoin = () => {
    if (!sessionId) return setError('ID de session requis');
    if (!username) return setError('Pseudo requis');
    if (!connected) return setError('Connexion au serveur perdue');
    if (likedArtists.length === 0) return setError('Choisis au moins 1 artiste');
    if (joining) return;

    setError('');
    setJoining(true);

    const artistNames = likedArtists.map(a => a.name);
    // On dérive les genres des artistes likés pour backward compat
    const likedGenres = [...new Set(likedArtists.flatMap(a => a.genres || []))].slice(0, 10);
    const hatedGenres = [];

    socket.emit('guest:join', {
      sessionId,
      username,
      likedGenres,
      hatedGenres,
      favoriteArtists: artistNames,
      likedArtists,   // données riches avec IDs Spotify
      mood,
    }, (res) => {
      setJoining(false);
      if (res?.error) return setError(res.error);
      sessionStorage.setItem('guest-identity', JSON.stringify({
        sessionId,
        username,
        likedGenres,
        hatedGenres,
        favoriteArtists: artistNames,
      }));
      game.setSessionId(sessionId);
      game.setUsername(username);
      navigate(`/guest/${sessionId}`);
    });
  };

  const goBack = () => {
    setError('');
    setStep(1);
  };

  return (
    <div className="page">
      <div className="card">
        <div className="card-header">
          <div className="logo">Roue de la Fortune</div>
          <div className="subtitle">{sessionId || 'Rejoins la soirée'}</div>
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
              <input className="input" placeholder="Ton pseudo"
                value={username} onChange={e => setUsername(e.target.value)}
                maxLength={20} autoFocus />
            </div>
            {error && <div className="error">{error}</div>}
            <button className="btn btn-primary btn-full"
              onClick={() => setStep(2)}
              disabled={!username.trim()}>
              Choisir mes artistes
            </button>
          </>
        )}

        {step === 2 && (
          <div className="artist-step">
            {/* Mood */}
            <div className="field">
              <label className="label">Ambiance du soir ?</label>
              <div className="mood-row">
                {MOODS.map(m => (
                  <button key={m.id}
                    className={`mood-btn ${mood === m.id ? 'mood-btn-active' : ''}`}
                    onClick={() => setMood(mood === m.id ? null : m.id)}>
                    <span className="mood-emoji">{m.emoji}</span>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Recherche */}
            <div className="field">
              <label className="label">Cherche un artiste</label>
              <div className="search-box">
                <input className="search-input" placeholder="Nom de l'artiste..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                <button className="search-btn" onClick={handleSearch}>→</button>
              </div>
              {searchResults.length > 0 && (
                <div className="artist-search-result">
                  {searchResults.map(a => {
                    const selected = likedArtists.some(s => s.id === a.id);
                    return (
                      <div key={a.id}
                        className={`artist-search-card ${selected ? 'artist-search-card-selected' : ''}`}
                        onClick={() => addSearchedArtist(a)}>
                        {a.image && <img src={a.image} alt={a.name} className="artist-search-img" />}
                        <div className="artist-search-info">
                          <div className="artist-search-name">{a.name}</div>
                          <div className="artist-search-genres">{a.genres?.slice(0, 2).join(', ') || ''}</div>
                        </div>
                        <div className="artist-search-check">{selected ? '✓' : '+'}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Grille curated */}
            <div className="field">
              <label className="label">Artistes populaires</label>
              {loadingArtists ? (
                <div className="artist-grid-loading">Chargement...</div>
              ) : (
                <div className="artist-grid">
                  {curatedArtists.map(a => {
                    const selected = likedArtists.some(s => s.id === a.id);
                    return (
                      <div key={a.id}
                        className={`artist-card ${selected ? 'artist-card-selected' : ''}`}
                        onClick={() => toggleArtist(a)}>
                        <div className="artist-card-img-wrapper">
                          {a.image ? (
                            <img src={a.image} alt={a.name} className="artist-card-img" />
                          ) : (
                            <div className="artist-card-placeholder">{a.name[0]}</div>
                          )}
                          {selected && <div className="artist-card-check">✓</div>}
                        </div>
                        <div className="artist-card-name">{a.name}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Chips sélection */}
            {likedArtists.length > 0 && (
              <div className="selected-chips">
                {likedArtists.map(a => (
                  <span key={a.id} className="chip" onClick={() => toggleArtist(a)}>
                    {a.name} ✕
                  </span>
                ))}
              </div>
            )}

            {error && <div className="error">{error}</div>}

            <div className="action-row">
              <button className="btn btn-secondary" onClick={goBack}>
                ← Retour
              </button>
              <button className="btn btn-primary" onClick={handleJoin} disabled={joining || likedArtists.length === 0}>
                {joining ? 'Connexion...' : `Rejoindre (${likedArtists.length})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
