import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useGame } from '../context/GameContext';
import { useGameEvents } from '../hooks/useGameEvents';
import QRCodeComponent from '../components/QRCode';
import PlayerList from '../components/PlayerList';
import QueueDisplay from '../components/QueueDisplay';

const SPOTIFY_SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

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
  const [nowPlaying, setNowPlaying] = useState(null);

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

  // Mettre à jour le now-playing quand currentTrack change
  useEffect(() => {
    if (game.currentTrack?.trackUri) {
      const cover = game.currentTrack.album?.images?.[0]?.url
        || game.currentTrack.album?.images?.[1]?.url
        || game.currentTrack.album?.images?.[2]?.url
        || null;
      setNowPlaying({
        title: game.currentTrack.title || 'Titre inconnu',
        artist: game.currentTrack.artist || 'Artiste inconnu',
        cover,
        trackUri: game.currentTrack.trackUri,
      });
    } else {
      setNowPlaying(null);
    }
  }, [game.currentTrack]);

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

  // Réinitialiser quizLoading au démarrage d'un round ou en cas d'erreur + timeout 30s
  useEffect(() => {
    if (!socket) return;
    const onQuizStart = () => setQuizLoading(false);
    const onQuizError = () => { setQuizLoading(false); alert('Erreur de génération du blind-test — réessaie'); };
    socket.on('quiz:start', onQuizStart);
    socket.on('quiz:launch-error', onQuizError);
    return () => { socket.off('quiz:start', onQuizStart); socket.off('quiz:launch-error', onQuizError); };
  }, [socket]);

  // Timeout de sécurité : si quizLoading reste > 30s, forcer le reset
  useEffect(() => {
    if (!quizLoading) return;
    const tid = setTimeout(() => setQuizLoading(false), 30000);
    return () => clearTimeout(tid);
  }, [quizLoading]);

  // Avance automatique quand les invités votent skip
  useEffect(() => {
    if (!socket) return;
    const onAdvance = () => {
      console.log('[Host] Advance requested (skip/next)');
      socket.emit('host:next-track');
    };
    socket.on('host:advance', onAdvance);
    return () => socket.off('host:advance', onAdvance);
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
    script.onerror = () => {
      setSpotifyError('Impossible de charger le SDK Spotify — vérifie ta connexion');
      setSpotifyLoading(false);
    };
    document.head.appendChild(script);
  };

  // ─── Handlers ───

  const startEvening = () => {
    if (!socket) return;
    socket.emit('host:start-evening', {
      sessionId,
      hostPreferences: { likedArtists: [], mood: null },
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
    if (spotifyRetryRef.current >= 3) {
      setSpotifyError('Échec après 3 tentatives — rafraîchis la page ou réessaie plus tard');
      return;
    }
    setSpotifyError('');
    setSpotifyLoading(true);
    document.querySelectorAll(`script[src="${SPOTIFY_SDK_URL}"]`).forEach(s => s.remove());
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

        {/* Now Playing — quand la musique tourne */}
        {nowPlaying && (
          <div className="now-playing">
            <div className="now-playing-cover">
              {nowPlaying.cover ? (
                <img src={nowPlaying.cover} alt={nowPlaying.album} />
              ) : (
                <div className="now-playing-placeholder">♪</div>
              )}
            </div>
            <div className="now-playing-info">
              <div className="now-playing-title">{nowPlaying.title}</div>
              <div className="now-playing-artist">{nowPlaying.artist}</div>
            </div>
            <div className="now-playing-bar">
              <div className="now-playing-bar-inner" />
            </div>
          </div>
        )}

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
          <div className="panel panel-spotify">
            <div className="panel-title">Musique</div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              Connexion à Spotify en cours...
            </p>
          </div>
        )}

        {/* Section d'invitation */}
        <div className="panel">
          <div className="panel-title">Inviter des participants</div>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 12 }}>
            Scannez le QR code ou partagez le lien
          </p>
          <QRCodeComponent value={joinUrl} />
          <div style={{ marginTop: 12 }}>
            <code className="invite-link" onClick={() => navigator.clipboard?.writeText(joinUrl)}>
              {joinUrl}
            </code>
          </div>
          {localUrl && (
            <div style={{ marginTop: 6 }}>
              <code className="invite-link invite-link-local" onClick={() => navigator.clipboard?.writeText(localUrl)}>
                {localUrl}
              </code>
            </div>
          )}
        </div>

        {/* Contrôles / Actions */}
        {spotifyConnected && game.mode === 'MODE_LOBBY' && (
          <div className="panel">
            <div className="panel-title">Prêt à lancer la soirée ?</div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 12 }}>
              {game.guests.length === 0
                ? 'Attends que des invités rejoignent avant de commencer.'
                : `${game.guests.length} participant${game.guests.length > 1 ? 's' : ''} dans la salle — lance la soirée quand tu veux !`}
            </p>
            <button className="btn btn-primary" onClick={startEvening} disabled={game.guests.length === 0}>
              Lancer la soirée 🎉
            </button>
          </div>
        )}

        {/* Pendant le jeu */}
        {game.mode === 'MODE_QUIZ' && (
          <div className="panel">
            <div className="panel-title">
              Blind-test Round {game.quizRound}
              {hostTimeLeft !== null && (
                <span className={`timer-badge ${hostTimeLeft <= 5 ? 'timer-critical' : ''}`}>
                  {Math.floor(hostTimeLeft / 60)}:{(hostTimeLeft % 60).toString().padStart(2, '0')}
                </span>
              )}
            </div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              Le blind-test est en cours — les invités écoutent et répondent.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button className="btn btn-primary" onClick={revealQuiz} disabled={quizLoading}>
                Révéler
              </button>
              <button className="btn btn-secondary" onClick={continueAfterQuiz} disabled={quizLoading}>
                {quizLoading ? 'Génération...' : 'Continuer →'}
              </button>
            </div>
          </div>
        )}

        {game.mode === 'MODE_JUKEBOX' && (
          <div className="panel">
            <div className="panel-title">Jukebox</div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              Les invités peuvent ajouter leurs morceaux dans la file d'attente.
            </p>
            <button className="btn btn-secondary" onClick={nextTrack}>
              Passer au suivant ⏭
            </button>
          </div>
        )}

        {game.quizRevealed && game.quizResults && (
          <div className="panel">
            <div className="panel-title">Résultats du Blind-test</div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              {game.quizResults.answer?.title || '—'} — {game.quizResults.answer?.artist || '—'}
            </p>
            {game.quizResults.results?.length > 0 && (
              <div className="results-table">
                <div className="results-table-header">
                  <span>Joueur</span>
                  <span>Réponse</span>
                  <span>Points</span>
                </div>
                {game.quizResults.results.map((r, i) => (
                  <div key={i} className={`results-row ${r.score > 0 ? 'results-row-correct' : 'results-row-wrong'}`}>
                    <span className="results-name">{r.username}</span>
                    <span className="results-answer">{r.answer || '—'}</span>
                    <span className="results-score">+{r.score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Participants connectés */}
        <PlayerList guests={game.guests} />

        {/* File d'attente */}
        <QueueDisplay queue={game.queue} />
      </div>
    </div>
  );
}
