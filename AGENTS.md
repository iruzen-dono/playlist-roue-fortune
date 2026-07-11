# Playlist Roue de la Fortune 🎡

Application web multi-joueur pour sélectionner aléatoirement des chansons via une roue de la fortune.

**Stack :** Node.js/Express 5, React/Vite, Socket.IO, Spotify API, cloudflared tunnel

## Architecture

```
playlist-roue-fortune/
├── backend/
│   ├── src/
│   │   ├── index.js            # Serveur Express + Socket.IO (point d'entrée)
│   │   ├── config/index.js     # Configuration (host, port, Spotify, etc.)
│   │   └── services/
│   │       ├── gameState.js    # Session en mémoire (Map sessionId → GameState)
│   │       ├── socketHandler.js # Tous les events socket (host, guest)
│   │       ├── localDb.js      # Persistance locale JSON (fallback)
│   │       ├── supabaseService.js # Persistance Supabase (optionnelle)
│   │       ├── spotifyOAuth.js # OAuth Spotify + Web Playback SDK
│   │       ├── spotifyService.js # Recherche Spotify
│   │       └── llmService.js   # Génération playlist IA (optionnel)
│   ├── public/                 # Frontend build (généré par npm run build:backend)
│   ├── data/                   # Sessions persistées (gitignoré)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── main.jsx            # Entry point React
│   │   ├── App.jsx             # Routes (BrowserRouter)
│   │   ├── context/
│   │   │   ├── SocketContext.jsx # Connexion Socket.IO
│   │   │   └── GameContext.jsx  # State global (guests, queue, mode, etc.)
│   │   ├── hooks/
│   │   │   └── useGameEvents.js # Sync socket → GameContext
│   │   ├── pages/
│   │   │   ├── HostSetup.jsx    # Création de session
│   │   │   ├── HostDashboard.jsx # Tableau de bord hôte
│   │   │   ├── GuestJoin.jsx    # Inscription invité (2 steps)
│   │   │   └── GuestView.jsx    # Vue invité (quiz, jukebox)
│   │   └── components/
│   │       ├── PlayerList.jsx   # Liste des participants
│   │       ├── QueueDisplay.jsx # File d'attente
│   │       └── QRCode.jsx       # QR code component
│   ├── vite.config.js
│   └── package.json
├── .gitignore
├── AGENTS.md
└── README.md
```

## Installation

```bash
# Backend
cd backend && npm install
cp .env.example .env  # Configurer Spotify, Supabase (optionnel)

# Frontend
cd frontend && npm install
```

## Développement

```bash
# Terminal 1 : Backend
cd backend && npm run dev

# Terminal 2 : Frontend (dev avec HMR)
cd frontend && npm run dev
```

## Production

```bash
# Build frontend + copie vers backend/public/
cd frontend && npm run build:backend

# Lancer
cd backend && NODE_ENV=production node src/index.js

# Tunnel cloudflared (pour accès mobile)
cloudflared tunnel --url http://localhost:3001
```

## Sessions

Les sessions sont stockées en mémoire + persistées dans `backend/data/session-*.json`.
En cas de restart serveur, les sessions sont restaurées depuis les fichiers JSON.
Supabase est optionnel — sans credentials, le fallback local est utilisé.

## Routes Web

| Route | Description |
|---|---|
| `/` | Création de session (HostSetup) |
| `/host/:sessionId` | Dashboard hôte |
| `/join/:sessionId` | Inscription invité (2 steps) |
| `/guest/:sessionId` | Vue invité |

## API

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/config/url` | URL publique pour le QR code |
| `POST /api/spotify/token` | Token Spotify pour Web Playback SDK |

## Variables d'environnement

| Variable | Description | Requis |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Client ID Spotify OAuth | Pour la musique |
| `SPOTIFY_CLIENT_SECRET` | Client Secret Spotify | Pour la musique |
| `PUBLIC_URL` | URL du tunnel cloudflared | Pour le QR code |
| `SUPABASE_URL` | URL Supabase | Optionnel (fallback local) |
| `SUPABASE_ANON_KEY` | Clé anonyme Supabase | Optionnel |
| `HOST_PASSWORD` | Mot de passe hôte (défaut: admin123) | Optionnel |
| `SESSION_PASSWORD` | Ancien nom (déprécié) | Optionnel |
