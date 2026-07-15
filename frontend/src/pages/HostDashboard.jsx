import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useGame } from '../context/GameContext';
import { useGameEvents } from '../hooks/useGameEvents';
import QRCodeComponent from '../components/QRCode';
import PlayerList from '../components/PlayerList';
import QueueDisplay from '../components/QueueDisplay';

const SPOTIFY_SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

const MOODS = [
  { id: 'chill', label: 'Chill', emoji: '🧘' },
  { id: 'balanced', label: 'Balance', emoji: '⚖️' },
  { id: 'energetic', label: 'Dansant', emoji: '🕺' },
];

export default function HostDashboard() {
  const { sessionId } = useParams();
  const { socket } = useSocket();
  const socketRef = useRef(socket);
  socketRef.current = socket;
  const game = useGame();
  useGameEvents();
  const [ngrokUrl, setNgrokUrl] = useState('');
  const [localIp, setLocalIp] = useState('');

  // Auto-détecter les URLs (tunnel + IP locale)
  useEffect(() => {
    const currentHost = window.location.host;
    const isLocal = currentHost === 'localhost:3001' || currentHost === '127.0.0.1:3001';
    if (!isLocal) {
      setNgrokUrl(`https://${currentHost}`);
    } else {
      fetch('/api/config/url')
        .then(r => r.json())
        .then(d => { if (d.publicUrl) setNgrokUrl(d.publicUrl); })
        .catch(() => {});
    }
    fetch('/api/config/local-ip')
      .then(r => r.json())
      .then(d => { if (d.localIp) setLocalIp(`http://${d.localIp}:${d.port}`); })
      .catch(() => {});
  }, []);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState('');
  const [quizLoading, setQuizLoading] = useState(false);
  const playerRef = useRef(null);
  const spotifyRetryRef = useRef(0);
  const [hostTimeLeft, setHostTimeLeft] = useState(null);
  const [searchParams] = useSearchParams();

  // ─── Host Vibe Panel state ───
  const [curatedArtists, setCuratedArtists] = useState([]);
  const [hostArtists, setHostArtists] = useState([]);
  const [hostMood, setHostMood] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingArtists, setLoadingArtists] = useState(false);

  // Charger la liste curated au montage
  useEffect(() => {
    setLoadingArtists(true);
    fetch('/api/curated-artists')
      .then(r => r.json())
      .then(data => {
        setCuratedArtists(data.artists || []);
        setLoadingArtists(false);
      })
      .catch(() => setLoadingArtists(false));
  }, []);

  const toggleHostArtist = (artist) => {
    setHostArtists(prev => {
      const exists = prev.find(a => a.id === artist.id);
      if (exists) return prev.filter(a => a.id !== artist.id);
      if (prev.length >= 5) return prev;
      return [...prev, artist];
    });
  };

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    fetch(`/api/search-artists?q=${encodeURIComponent(searchQuery.trim())}`)
      .then(r => r.json())
      .then(data => {
        setSearchResults(data.artist ? [data.artist] : []);
      })
      .catch(() => setSearchResults([]));
  };

  const addSearched = (artist) => {
    toggleHostArtist(artist);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Aggréger les artistes likés par les invités
  const guestTaste = useMemo(() => {
    const counts = {};
    game.guests.forEach(guest => {
      (guest.likedArtists || []).forEach(a => {
        const key = a.id || a.name;
        if (!counts[key]) {
          counts[key] = { ...a, count: 0 };
        }
        counts[key].count += 1;
      });
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [game.guests]);

  // ─── Fin Vibe Panel ───

  // Détecter retour OAuth
  useEffect(() => {
    if (searchParams.get('spotify') === 'connected') {
      setSpotifyLoading(true);
      loadSpotifySDK();
    }
  }, [searchParams]);

  useEffect(() => {
    game.setSessionId(sessionId);
  }, [sessionId]);

  // Rejoindre la room socket si on arrive directement (refresh)
  useEffect(() => {
    if (!socket || !sessionId) return;
    socket.emit('host:rejoin-session', { sessionId }, (res) => {
      if (res?.error) {
        console.warn('[Rejoin] Session not found:', res.error);
        return;
      }
      if (res?.session) {
        game.updateFromState(res.session);
      }
    });
  }, [socket, sessionId]);

  // Quand le morceau change → le jouer sur Spotify
  useEffect(() => {
    if (!socket || !game.currentTrack?.trackUri || !spotifyConnected) return;
    socket.emit('host:play-track', {
      trackUri: game.currentTrack.trackUri,
      positionMs: 0,
    }, (res) => {
      if (res?.error) console.error('[Spotify] Play error:', res.error);
    });
  }, [socket, game.currentTrack?.trackUri, spotifyConnected]);

  // Écouter spotify:device-ready
  useEffect(() => {
    if (!socket) return;
    const handleReady = () => {
      setSpotifyConnected(true);
      setSpotifyLoading(false);
    };
    socket.on('spotify:device-ready', handleReady);
    return () => socket.off('spotify:device-ready', handleReady);
  }, [socket]);

  // Réinitialiser quizLoading au démarrage d'un round ou en cas d'erreur
  useEffect(() => {
    if (!socket) return;
    const onQuizStart = () => setQuizLoading(false);
    const onQuizError = () => { setQuizLoading(false); alert('Erreur de génération du blind-test — réessaie'); };
    socket.on('quiz:start', onQuizStart);
    socket.on('quiz:launch-error', onQuizError);
    return () => { socket.off('quiz:start', onQuizStart); socket.off('quiz:launch-error', onQuizError); };
  }, [socket]);

  // Timer décompte live côté host
  useEffect(() => {
    if (!game.quizEndsAt) { setHostTimeLeft(null); return; }
    const tick = () => {
      const left = Math.max(0, Math.floor((game.quizEndsAt - Date.now()) / 1000));
      setHostTimeLeft(left);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [game.quizEndsAt]);

  const loadSpotifySDK = () => {
    window.onSpotifyWebPlaybackSDKReady = () => {
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        setSpotifyError('Délai dépassé — vérifie que Spotify est ouvert et que tu es Premium');
        setSpotifyLoading(false);
      }, 15000);

      const player = new window.Spotify.Player({
        name: `Roue de la Fortune — ${sessionId}`,
        getOAuthToken: async (cb) => {
          if (timedOut) { cb(''); return; }
          try {
            const res = await fetch('/api/spotify/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId }),
            });
            const data = await res.json();
            if (!data.access_token) {
              console.error('[Spotify] Token error:', data.error);
              setSpotifyError(`Erreur Spotify: ${data.error || 'token invalide'}`);
              setSpotifyLoading(false);
              return;
            }
            cb(data.access_token);
          } catch (err) {
            console.error('[Spotify] Token fetch failed:', err);
            setSpotifyError('Erreur de connexion Spotify — vérifie le tunnel');
            setSpotifyLoading(false);
          }
        },
        volume: 0.8,
      });

      player.addListener('ready', ({ device_id }) => {
        console.log('[Spotify] Player ready:', device_id);
        clearTimeout(timeout);
        setSpotifyLoading(false);
        socketRef.current?.emit('host:spotify-device', { deviceId: device_id, sessionId });
      });

      player.addListener('not_ready', ({ device_id }) => {
        console.log('[Spotify] Player not ready:', device_id);
        clearTimeout(timeout);
        setSpotifyConnected(false);
      });

      player.addListener('initialization_error', ({ message }) => {
        console.error('[Spotify] Init error:', message);
        clearTimeout(timeout);
        setSpotifyError(message);
        setSpotifyLoading(false);
      });

      player.addListener('authentication_error', ({ message }) => {
        console.error('[Spotify] Auth error:', message);
        clearTimeout(timeout);
        setSpotifyError('Authentification Spotify échouée. Reconnectez-vous.');
        setSpotifyConnected(false);
        setSpotifyLoading(false);
      });

      player.addListener('account_error', ({ message }) => {
        console.error('[Spotify] Account error:', message);
        clearTimeout(timeout);
        setSpotifyError('Compte non Premium. Abonnement Premium requis.');
        setSpotifyLoading(false);
      });

      playerRef.current = player;
      player.connect().then(success => {
        if (!success) {
          clearTimeout(timeout);
          setSpotifyError('Impossible de lancer le player — réessaie');
          setSpotifyLoading(false);
        }
      });
    };

    const script = document.createElement('script');
    script.src = SPOTIFY_SDK_URL;
    document.head.appendChild(script);
  };

  // ─── Handlers ───

  const startEvening = () => {
    if (!socket) return;
    socket.emit('host:start-evening', {
      sessionId,
      hostPreferences: {
        likedArtists: hostArtists,
        mood: hostMood,
      },
    }, (res) => {
      if (res.error) alert(res.error);
    });
  };

  const revealQuiz = () => {
    socket.emit('host:reveal-quiz');
  };

  const continueAfterQuiz = () => {
    setQuizLoading(true);
    socket.emit('host:continue-after-quiz');
  };

  const startJukebox = () => {
    socket.emit('host:start-jukebox');
  };

  const nextTrack = () => {
    socket.emit('host:next-track');
  };

  const handleConnectSpotify = () => {
    window.location.href = `/api/spotify/login?session=${sessionId}`;
  };

  const retrySpotifySDK = () => {
    spotifyRetryRef.current += 1;
    setSpotifyError('');
    setSpotifyLoading(true);
    loadSpotifySDK();
  };

  const joinUrl = `${ngrokUrl || window.location.origin}/join/${sessionId}`;
  const localUrl = localIp ? `${localIp}/join/${sessionId}` : null;

  return (
    <div className="page">
      <div className="dashboard">
        {/* En-tête */}
        <div className="dash-header">
          <div>
            <div className="logo">Roue de la Fortune</div>
            <div className="session-tag">{sessionId}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="guest-count">{game.guests.length} participant{game.guests.length !== 1 ? 's' : ''}</div>
            {spotifyConnected && <span className="badge badge-spotify">🎵 Spotify</span>}
          </div>
        </div>

        {/* Statut Spotify */}
        {!spotifyConnected && !spotifyLoading && (
          <div className="panel panel-spotify">
            <div className="panel-title">Musique</div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 12 }}>
              Connecte ton compte Spotify Premium pour lancer la musique
            </p>
            <button className="btn btn-spotify" onClick={handleConnectSpotify}>
              🎧 Connecter Spotify
            </button>
            {spotifyError && <div className="error" style={{ marginTop: 8 }}>{spotifyError}</div>}
            {spotifyError && spotifyRetryRef.current < 3 && (
              <button className="btn btn-secondary" style={{ marginTop: 6 }} onClick={retrySpotifySDK}>
                Réessayer
              </button>
            )}
          </div>
        )}
        {spotifyLoading && (
          <div className="panel" style={{ textAlign: 'center' }}>
            <div className="panel-title">Connexion Spotify</div>
            <p style={{ color: 'var(--text-dim)' }}>Connexion en cours...</p>
          </div>
        )}

        {/* ─── VIBE PANEL — avant le lancement ─── */}
        {game.mode === 'MODE_LOBBY' && spotifyConnected && (
          <div className="panel">
            <div className="panel-title">Ambiance de la soirée</div>

            {/* Mood */}
            <div className="field" style={{ marginBottom: 16 }}>
              <label className="label">Mood général</label>
              <div className="mood-row">
                {MOODS.map(m => (
                  <button key={m.id}
                    className={`mood-btn ${hostMood === m.id ? 'mood-btn-active' : ''}`}
                    onClick={() => setHostMood(hostMood === m.id ? null : m.id)}>
                    <span className="mood-emoji">{m.emoji}</span>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Recherche artiste hôte */}
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="label">Tes artistes (max 5)</label>
              <div className="search-box">
                <input className="search-input" placeholder="Cherche un artiste..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                <button className="search-btn" onClick={handleSearch}>→</button>
              </div>
              {searchResults.length > 0 && (
                <div className="artist-search-result" style={{ marginBottom: 8 }}>
                  {searchResults.map(a => {
                    const selected = hostArtists.some(s => s.id === a.id);
                    return (
                      <div key={a.id}
                        className={`artist-search-card ${selected ? 'artist-search-card-selected' : ''}`}
                        onClick={() => addSearched(a)}>
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

            {/* Grille artistes populaires (host) */}
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="label">Artistes populaires</label>
              {loadingArtists ? (
                <div className="artist-grid-loading">Chargement...</div>
              ) : (
                <div className="artist-grid-host">
                  {curatedArtists.map(a => {
                    const selected = hostArtists.some(s => s.id === a.id);
                    return (
                      <div key={a.id}
                        className={`artist-card-host ${selected ? 'artist-card-host-selected' : ''}`}
                        onClick={() => toggleHostArtist(a)}>
                        <div className="artist-card-img-wrapper-host">
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

            {/* Chips sélection host */}
            {hostArtists.length > 0 && (
              <div className="selected-chips">
                {hostArtists.map(a => (
                  <span key={a.id} className="chip" onClick={() => toggleHostArtist(a)}>
                    {a.name} ✕
                  </span>
                ))}
              </div>
            )}

            {/* Guest taste mosaic */}
            {guestTaste.length > 0 && (
              <div className="field" style={{ marginTop: 16 }}>
                <label className="label">Tes invités aiment</label>
                <div className="guest-taste-grid">
                  {guestTaste.slice(0, 9).map(a => (
                    <div key={a.id || a.name} className="guest-taste-card">
                      {a.image && <img src={a.image} alt={a.name} className="guest-taste-img" />}
                      <div className="guest-taste-name">{a.name}</div>
                      {a.count > 1 && <div className="guest-taste-count">x{a.count}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Grille principale */}
        <div className="dash-grid">
          {/* QR Code + Lien */}
          <div className="panel">
            <div className="panel-title">Accès invités</div>
            <div className="qr-wrapper">
              <QRCodeComponent value={joinUrl} size={180} />
            </div>
            <div className="input-readonly">Tunnel : {joinUrl}</div>
            {localUrl && <div className="input-readonly" style={{ marginTop: 4, color: 'var(--green)' }}>📡 Local : {localUrl}</div>}
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
                  disabled={game.guests.length === 0 || !spotifyConnected}>
                  Lancer la soirée
                </button>
              )}
              {game.mode === 'MODE_QUIZ' && (
                <>
                  <div className="badge badge-quiz">Blind-test Round {game.quizRound}</div>
                  {hostTimeLeft !== null && (
                    <div className="quiz-timer" style={{
                      fontSize: '1.4rem',
                      fontWeight: 700,
                      color: hostTimeLeft <= 5 ? 'var(--danger)' : 'var(--accent)',
                      minWidth: 40,
                      textAlign: 'center',
                    }}>
                      {hostTimeLeft}s
                    </div>
                  )}
                  {!game.quizRevealed ? (
                    <div className="controls-group">
                      <button className="btn btn-primary" onClick={revealQuiz}>
                        Révéler
                      </button>
                      <button className="btn btn-ghost" onClick={startJukebox}>
                        Passer au jukebox
                      </button>
                    </div>
                  ) : (
                    <div className="controls-group">
                      <button className="btn btn-secondary" onClick={continueAfterQuiz}
                        disabled={quizLoading}>
                        {quizLoading ? 'Génération...' : 'Continuer'}
                      </button>
                      <button className="btn btn-ghost" onClick={startJukebox}>
                        Passer au jukebox
                      </button>
                    </div>
                  )}
                </>
              )}
              {game.mode === 'MODE_JUKEBOX' && (
                <button className="btn btn-primary" onClick={nextTrack}
                  disabled={game.queue.length === 0}>
                  Morceau suivant
                </button>
              )}
              {game.mode === 'MODE_RECAP' && (
                <div className="badge badge-quiz">🎉 Fin de la soirée</div>
              )}
            </div>
          </div>
        </div>

        {/* En cours */}
        {game.currentTrack && (
          <div className="panel now-playing">
            <div className="now-label">EN COURS</div>
            <div className="now-title">{game.currentTrack.title}</div>
            {game.currentTrack.artist && <div className="now-artist">{game.currentTrack.artist}</div>}
          </div>
        )}

        {/* Queue */}
        <QueueDisplay />
      </div>
    </div>
  );
}
