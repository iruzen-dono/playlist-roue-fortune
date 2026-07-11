import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
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
app.use(cors());
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