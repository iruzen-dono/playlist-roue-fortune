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
  const game = useGame();
  useGameEvents();
  const [ngrokUrl, setNgrokUrl] = useState('');

  // Auto-détecter l'URL publique (cloudflare tunnel ou hébergement)
  useEffect(() => {
    const currentHost = window.location.host;
    const isLocal = currentHost === 'localhost:3001' || currentHost === '127.0.0.1:3001';
    if (!isLocal) {
      setNgrokUrl(`https://${currentHost}`);
    } else {
      // Depuis localhost, récupérer l'URL publique depuis le backend
      fetch('/api/config/url')
        .then(r => r.json())
        .then(d => { if (d.publicUrl) setNgrokUrl(d.publicUrl); })
        .catch(() => {});
    }
  }, []);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState('');
  const playerRef = useRef(null);
  const [searchParams] = useSearchParams();

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

  const loadSpotifySDK = () => {
    if (window.Spotify) {
      initPlayer();
      return;
    }
    const script = document.createElement('script');
    script.src = SPOTIFY_SDK_URL;
    script.onload = () => initPlayer();
    script.onerror = () => {
      setSpotifyError('Impossible de charger le SDK Spotify');
      setSpotifyLoading(false);
    };
    document.body.appendChild(script);
  };

  const initPlayer = () => {
    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: `Roue de la Fortune — ${sessionId}`,
        getOAuthToken: async (cb) => {
          try {
            const res = await fetch('/api/spotify/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId }),
            });
            const data = await res.json();
            cb(data.access_token);
          } catch (err) {
            console.error('[Spotify] Token fetch failed:', err);
            setSpotifyError('Erreur de connexion Spotify');
          }
        },
        volume: 0.8,
      });

      player.addListener('ready', ({ device_id }) => {
        console.log('[Spotify] Player ready:', device_id);
        socket?.emit('host:spotify-device', { deviceId: device_id });
      });

      player.addListener('not_ready', ({ device_id }) => {
        console.log('[Spotify] Player not ready:', device_id);
        setSpotifyConnected(false);
      });

      player.addListener('initialization_error', ({ message }) => {
        console.error('[Spotify] Init error:', message);
        setSpotifyError(message);
        setSpotifyLoading(false);
      });

      player.addListener('authentication_error', ({ message }) => {
        console.error('[Spotify] Auth error:', message);
        setSpotifyError('Authentification Spotify échouée. Reconnectez-vous.');
        setSpotifyConnected(false);
        setSpotifyLoading(false);
      });

      player.connect().then(success => {
        if (!success) {
          setSpotifyError('Impossible de connecter le player Spotify');
          setSpotifyLoading(false);
        }
      });

      playerRef.current = player;
    };
  };

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

  const handleConnectSpotify = () => {
    window.location.href = `/api/spotify/login?session=${sessionId}`;
  };

  const joinUrl = `${ngrokUrl || window.location.origin}/join/${sessionId}`;

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
          </div>
        )}
        {spotifyLoading && (
          <div className="panel" style={{ textAlign: 'center' }}>
            <div className="panel-title">Connexion Spotify</div>
            <p style={{ color: 'var(--text-dim)' }}>Connexion en cours...</p>
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
                  disabled={game.guests.length === 0 || !spotifyConnected}>
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
