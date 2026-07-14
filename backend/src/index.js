import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import os from 'os';
import { config } from './config/index.js';
import { initSupabase } from './services/supabaseService.js';
import { setupSocketHandlers } from './services/socketHandler.js';
import { getAuthUrl, exchangeCode, setHostTokens, setDeviceId, getValidAccessToken } from './services/spotifyOAuth.js';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.nodeEnv === 'development'
      ? ['http://localhost:5173', 'http://localhost:4173']
      : true,
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: config.nodeEnv === 'development'
    ? ['http://localhost:5173', 'http://localhost:4173']
    : process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false,
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Spotify OAuth — login
app.get('/api/spotify/login', (req, res) => {
  const { session } = req.query;
  if (!session) return res.status(400).json({ error: 'Missing session param' });
  res.redirect(getAuthUrl(session));
});

// Spotify OAuth — callback
app.get('/api/spotify/callback', async (req, res) => {
  const { code, state: sessionId } = req.query;
  if (!code || !sessionId) {
    return res.status(400).send('Missing code or state');
  }

  try {
    const data = await exchangeCode(code);
    setHostTokens(sessionId, data.refresh_token);

    // Redirect back to the host dashboard
    res.redirect(`/host/${sessionId}?spotify=connected`);
  } catch (err) {
    console.error('[Spotify OAuth] Callback error:', err);
    res.status(500).send('OAuth failed');
  }
});

// Spotify — get access token for Web Playback SDK
app.post('/api/spotify/token', express.json(), async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

  try {
    const token = await getValidAccessToken(sessionId);
    if (!token) return res.status(401).json({ error: 'No Spotify connected' });
    res.json({ access_token: token });
  } catch (err) {
    console.error('[Spotify] Token endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Session debug endpoint (pour le host)
app.get('/api/session/:sessionId', (req, res) => {
  // Note: les sessions sont en mémoire, accessibles via le module socketHandler
  // On expose via un import direct
  res.json({ note: 'See websocket events for live session data' });
});

// URL publique pour le QR code (mettre PUBLIC_URL dans l'env du serveur)
app.get('/api/config/url', (req, res) => {
  res.json({ publicUrl: process.env.PUBLIC_URL || null });
});

// IP locale pour le QR code sur le même réseau WiFi
app.get('/api/config/local-ip', (req, res) => {
  try {
    const interfaces = os.networkInterfaces();
    let localIp = '127.0.0.1';
    // Prioriser l'IP du réseau local (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    for (const name of Object.keys(interfaces)) {
      if (name.startsWith('vEthernet') || name.startsWith('Loopback') || name === 'lo') continue;
      const addrs = interfaces[name].filter(a => a.family === 'IPv4' && !a.internal);
      for (const addr of addrs) {
        const ip = addr.address;
        // Vérifier si c'est une IP privée standard (pas Tailscale/CGNAT)
        if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.match(/^172\.(1[6-9]|2\d|3[01])\./)) {
          localIp = ip;
          break;
        }
      }
      if (localIp !== '127.0.0.1') break;
    }
    // Fallback: première IP non locale trouvée
    if (localIp === '127.0.0.1') {
      for (const name of Object.keys(interfaces)) {
        if (name.startsWith('vEthernet') || name.startsWith('Loopback') || name === 'lo') continue;
        const addrs = interfaces[name].filter(a => a.family === 'IPv4' && !a.internal);
        if (addrs.length > 0) { localIp = addrs[0].address; break; }
      }
    }
    res.json({ localIp, port: config.serverPort || 3001 });
  } catch (err) {
    console.error('[local-ip] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// En production, servir le frontend build (APRÈS toutes les routes API)
if (config.nodeEnv === 'production') {
  app.use(express.static('public'));
  app.get('/{*path}', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return;
    res.sendFile('public/index.html', { root: '.' });
  });
}

// Init Supabase (peut être null si pas configuré)
initSupabase(config.supabase.url, config.supabase.anonKey);

// Socket handlers
setupSocketHandlers(io);

server.listen(config.port, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   🎡 Playlist Roue de la Fortune         ║
║   Backend ready on port ${config.port}        ║
║   Mode: ${config.nodeEnv.toUpperCase().padEnd(20)} ║
╚═══════════════════════════════════════════╝
`);
});