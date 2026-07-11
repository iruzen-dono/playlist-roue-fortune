# Playlist Roue de la Fortune 🎡

Application web multi-joueur pour sélectionner aléatoirement des chansons via une roue de la fortune.

**Stack :** Node.js/Express 5, React/Vite, Socket.IO, Spotify API, Tailscale Funnel (tunnel permanent)

## Architecture

```
playlist-roue-fortune/
├── backend/                       # Node.js (Express 5 + Socket.IO)
│   ├── src/
│   │   ├── index.js               # Point d'entrée — routes, SPA, Socket.IO
│   │   ├── config/index.js        # Config depuis .env (host, port, Spotify, etc.)
│   │   └── services/
│   │       ├── gameState.js       # Sessions en mémoire (Map sessionId → GameState)
│   │       ├── socketHandler.js   # Tous les events socket (host, guest, playback)
│   │       ├── localDb.js         # Persistance locale JSON (fallback)
│   │       ├── supabaseService.js # Persistance Supabase (optionnelle)
│   │       ├── spotifyOAuth.js    # OAuth Spotify + Web Playback SDK
│   │       ├── spotifyService.js  # Recherche Spotify
│   │       └── llmService.js      # Génération playlist IA (optionnel)
│   ├── public/                    # Frontend build (généré, gitignoré)
│   ├── data/                      # Sessions persistées en JSON (gitignoré)
│   ├── .env                       # Credentials (gitignoré)
│   └── package.json
├── frontend/                      # React (Vite)
│   ├── src/
│   │   ├── main.jsx               # Entry point React
│   │   ├── App.jsx                # Routes (BrowserRouter)
│   │   ├── context/
│   │   │   ├── SocketContext.jsx  # Connexion Socket.IO
│   │   │   └── GameContext.jsx    # State global (guests, queue, mode, etc.)
│   │   ├── hooks/
│   │   │   └── useGameEvents.js   # Sync socket → GameContext
│   │   ├── pages/
│   │   │   ├── HostSetup.jsx      # Création de session
│   │   │   ├── HostDashboard.jsx  # Tableau de bord hôte
│   │   │   ├── GuestJoin.jsx      # Inscription invité (2 steps)
│   │   │   └── GuestView.jsx      # Vue invité (quiz, jukebox)
│   │   └── components/
│   │       ├── PlayerList.jsx     # Liste des participants
│   │       ├── QueueDisplay.jsx   # File d'attente
│   │       └── QRCode.jsx         # QR code component
│   ├── vite.config.js
│   └── package.json
├── .gitignore
├── AGENTS.md
└── README.md
```

## Installation rapide

```bash
cd backend && npm install
cd ../frontend && npm install
```

## Configuration `.env`

Créer `backend/.env` :

```env
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=https://the-chosen-1ne-1.taile64e86.ts.net/api/spotify/callback
HOST_PASSWORD=admin123
PUBLIC_URL=https://the-chosen-1ne-1.taile64e86.ts.net
```

## Lancer en production

```bash
# Build + copie frontend
cd frontend && npm run build:backend

# Lancer backend
cd ../backend && PUBLIC_URL="https://the-chosen-1ne-1.taile64e86.ts.net" NODE_ENV=production node src/index.js

# Tunnel permanent (Tailscale Funnel)
tailscale funnel 3001
```

## Routes Web

| Route | Description |
|---|---|
| `/` | Création de session (HostSetup) |
| `/host/:sessionId` | Dashboard hôte (QR code, playlist, Spotify) |
| `/join/:sessionId` | Inscription invité (2 steps) |
| `/guest/:sessionId` | Vue invité (quiz, jukebox) |

## API

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/config/url` | URL publique pour le QR code |
| `GET /api/spotify/login?session={id}` | Redirige vers auth Spotify |
| `GET /api/spotify/callback?code=...&state=...` | Callback OAuth Spotify |
| `POST /api/spotify/token` | Token pour Web Playback SDK |

## Sessions

Les sessions sont stockées en mémoire + persistées dans `backend/data/session-*.json`.
En cas de restart serveur, les sessions sont restaurées depuis les fichiers JSON.
Supabase est optionnel — sans credentials, le fallback local est utilisé.

## Fixes importants (historique)

### Race condition SDK Spotify
- **Symptôme :** "Connexion en cours..." ne se termine jamais
- **Cause :** `window.onSpotifyWebPlaybackSDKReady` défini après le chargement du script
- **Solution :** Définir le callback AVANT d'ajouter le script au DOM

### Route catch-all Express 5
- **Problème :** `app.get('*', ...)` non supporté par Express 5
- **Fix :** Utiliser `app.get('/{*path}', ...)` et placer APRÈS toutes les routes API

### QR path param
- **Problème :** Route `/join` sans `:sessionId` → page blanche
- **Fix :** Route `/join/:sessionId` + GuestJoin lit depuis `useParams()`

### Tunnel permanent
- **Solution :** Tailscale Funnel remplace cloudflared
- **URL :** `https://the-chosen-1ne-1.taile64e86.ts.net` (permanente)

## Variables d'environnement

| Variable | Description | Requis |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Client ID Spotify | Oui (pour la musique) |
| `SPOTIFY_CLIENT_SECRET` | Client Secret Spotify | Oui (pour la musique) |
| `SPOTIFY_REDIRECT_URI` | URL callback OAuth | Oui |
| `PUBLIC_URL` | URL publique QR code | Oui |
| `HOST_PASSWORD` | Mot de passe hôte | Non (défaut: admin123) |
| `SUPABASE_URL` | URL Supabase | Non (fallback local) |
| `SUPABASE_ANON_KEY` | Clé anonyme Supabase | Non |
