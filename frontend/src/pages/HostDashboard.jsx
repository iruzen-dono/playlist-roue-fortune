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
  const [localIp, setLocalIp] = useState('');

  // Auto-détecter les URLs (tunnel + IP locale)
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
    // Récupérer l'IP locale pour les invités sur le même WiFi
    fetch('/api/config/local-ip')
      .then(r => r.json())
      .then(d => { if (d.localIp) setLocalIp(`http://${d.localIp}:${d.port}`); })
      .catch(() => {});
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

  const loadSpotifySDK = () => {
    // CRITIQUE : définir le callback AVANT de charger le script,
    // sinon le SDK l'appelle avant qu'il ne soit défini
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
        setSpotifyConnected(true);
        setSpotifyLoading(false);
        socket?.emit('host:spotify-device', { deviceId: device_id, sessionId });
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

      player.connect().then(success => {
        clearTimeout(timeout);
        if (!success) {
          setSpotifyError('Impossible de connecter le player Spotify');
          setSpotifyLoading(false);
        }
      });

      playerRef.current = player;
    };

    const script = document.createElement('script');
    script.src = SPOTIFY_SDK_URL;
    script.onerror = () => {
      setSpotifyError('Impossible de charger le SDK Spotify');
      setSpotifyLoading(false);
    };
    document.body.appendChild(script);
  };

  const startEvening = () => {
    socket.emit('host:start-evening', { sessionId }, (res) => {
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
