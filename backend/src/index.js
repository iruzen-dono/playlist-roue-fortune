import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from './config/index.js';
import { initSupabase } from './services/supabaseService.js';
import { setupSocketHandlers } from './services/socketHandler.js';

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

// En production, servir le frontend build
if (config.nodeEnv === 'production') {
  app.use(express.static('public'));
  // SPA fallback
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return;
    res.sendFile('public/index.html', { root: '.' });
  });
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Session debug endpoint (pour le host)
app.get('/api/session/:sessionId', (req, res) => {
  // Note: les sessions sont en mémoire, accessibles via le module socketHandler
  // On expose via un import direct
  res.json({ note: 'See websocket events for live session data' });
});

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