# 🎡 Playlist Roue de la Fortune

Application web multi-joueur pour organiser des soirées musicales interactives. Les participants scannent un QR code, rejoignent une session, et la roue de la fortune sélectionne aléatoirement les chansons de la playlist Spotify.

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| **Roue de la Fortune** | Sélection aléatoire de chansons tour par tour |
| **Mode Quiz** | Deviner le titre/l'artiste d'un extrait musical |
| **Mode Jukebox** | Les invités votent pour la prochaine chanson |
| **Connexion Spotify** | Lecture en temps réel via le Web Playback SDK |
| **Multi-joueur** | Rejoindre via QR code, jusqu'à 50+ participants |
| **Persistance** | Sessions sauvegardées localement (pas de perte au refresh) |
| **Tunnel permanent** | URL fixe via Tailscale Funnel — jamais de changement |

## 🏗️ Architecture

```
playlist-roue-fortune/
├── backend/
│   ├── src/
│   │   ├── index.js              # Serveur Express + Socket.IO (point d'entrée)
│   │   ├── config/index.js       # Configuration (host, port, Spotify, etc.)
│   │   └── services/
│   │       ├── gameState.js      # Session en mémoire (Map sessionId → GameState)
│   │       ├── socketHandler.js  # Tous les events socket (host, guest, playback)
│   │       ├── localDb.js        # Persistance locale JSON (fallback)
│   │       ├── supabaseService.js # Persistance Supabase (optionnelle)
│   │       ├── spotifyOAuth.js   # OAuth Spotify + Web Playback SDK
│   │       ├── spotifyService.js # Recherche Spotify
│   │       └── llmService.js     # Génération playlist IA (optionnel)
│   ├── public/                   # Frontend build (généré par npm run build:backend)
│   ├── data/                     # Sessions persistées en JSON
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── main.jsx              # Entry point React
│   │   ├── App.jsx               # Routes (BrowserRouter)
│   │   ├── context/
│   │   │   ├── SocketContext.jsx # Connexion Socket.IO
│   │   │   └── GameContext.jsx   # State global (guests, queue, mode, etc.)
│   │   ├── hooks/
│   │   │   └── useGameEvents.js  # Sync socket → GameContext
│   │   ├── pages/
│   │   │   ├── HostSetup.jsx     # Création de session
│   │   │   ├── HostDashboard.jsx # Tableau de bord hôte
│   │   │   ├── GuestJoin.jsx     # Inscription invité (2 steps)
│   │   │   └── GuestView.jsx     # Vue invité (quiz, jukebox)
│   │   └── components/
│   │       ├── PlayerList.jsx    # Liste des participants
│   │       ├── QueueDisplay.jsx  # File d'attente
│   │       └── QRCode.jsx        # QR code component
│   ├── vite.config.js
│   └── package.json
├── .gitignore
├── AGENTS.md
└── README.md
```

## 🚀 Démarrage rapide

### Prérequis

| Outil | Version min | Installation |
|---|---|---|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| npm | 8+ | (inclus avec Node.js) |
| Spotify Developer App | — | [developer.spotify.com](https://developer.spotify.com/dashboard) |
| Tailscale | 1.60+ | [tailscale.com/download](https://tailscale.com/download) (pour tunnel permanent) |

### 1. Installer les dépendances

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configurer Spotify

1. Va sur le [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Crée une nouvelle app (ou utilise une existante)
3. Note le **Client ID** et **Client Secret**
4. Dans **Edit Settings → Redirect URIs**, ajoute :
   - `https://the-chosen-1ne-1.taile64e86.ts.net/api/spotify/callback` (production)
   - `http://localhost:5173/api/spotify/callback` (développement)
5. Crée `backend/.env` (voir `.env.example`) :

```env
SPOTIFY_CLIENT_ID=ton_client_id
SPOTIFY_CLIENT_SECRET=ton_client_secret
SPOTIFY_REDIRECT_URI=https://the-chosen-1ne-1.taile64e86.ts.net/api/spotify/callback
HOST_PASSWORD=ton_mot_de_passe
```
6. Active le **Web Playback SDK** dans les paramètres de l'app Spotify.

### 3. Lancer en production

```bash
# Build + copie frontend
cd frontend && npm run build:backend

# Lancer le backend
cd ../backend
PUBLIC_URL="https://the-chosen-1ne-1.taile64e86.ts.net" NODE_ENV=production node src/index.js
```

### 4. Exposer via tunnel permanent

**Avec Tailscale Funnel (recommandé — URL permanente) :**

```bash
tailscale funnel 3001
```

L'app est accessible sur : `https://<machine>.<tailnet>.ts.net/`

**Avec cloudflared (temporaire — URL change à chaque restart) :**

```bash
cloudflared tunnel --url http://localhost:3001
```

## 📱 Routes Web

| Route | Description |
|---|---|
| `/` | Création de session (écran hôte) |
| `/host/:sessionId` | Tableau de bord hôte (QR code, playlist, Spotify) |
| `/join/:sessionId` | Inscription invité (2 steps : nom + préférences) |
| `/guest/:sessionId` | Vue invité (participer à la roue/quiz/jukebox) |

## 🔌 API REST

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/config/url` | Retourne l'URL publique du QR code |
| GET | `/api/spotify/login?session={id}` | Redirige vers l'auth Spotify (démarre OAuth) |
| GET | `/api/spotify/callback?code=...&state=...` | Callback OAuth Spotify (redirige vers le dashboard) |
| POST | `/api/spotify/token` | `{ sessionId }` → `{ access_token }` pour Web Playback SDK |

## 📡 Events Socket.IO

### Host → Serveur

| Event | Payload | Description |
|---|---|---|
| `host:create-session` | `{ password, hostName }` | Crée une session, retourne `{ sessionId }` |
| `host:rejoin-session` | `{ sessionId }` | Rejoindre la room après refresh |
| `host:spotify-device` | `{ deviceId }` | Enregistrer le device Spotify |
| `host:start-evening` | —— | Passer en mode quiz (soirée) |
| `host:start-jukebox` | —— | Passer en mode jukebox |
| `host:next-track` | —— | Passer à la chanson suivante |
| `host:play-track` | `{ trackUri, positionMs }` | Lancer une chanson sur Spotify |

### Guest → Serveur

| Event | Payload | Description |
|---|---|---|
| `guest:join` | `{ sessionId, username, password }` | Rejoindre une session |
| `guest:vote` | `{ trackId, vote }` | Voter pour une chanson (jukebox) |
| `guest:spin` | —— | Actionner la roue |

### Serveur → Host/Guest

| Event | Payload | Description |
|---|---|---|
| `game:state-update` | `{ session, players, mode, ... }` | Mise à jour de l'état de la session |
| `spotify:device-ready` | —— | Le device Spotify est prêt |

## 🔐 Connexion Spotify (flux détaillé)

```
1. Host clique "Connexion Spotify"
   → GET /api/spotify/login?session={sessionId}
   → Redirection vers accounts.spotify.com/authorize

2. Utilisateur autorise l'application
   → Spotify redirige vers {redirect_uri}?code=...&state={sessionId}
   → Le callback reçoit le code, l'échange contre un refresh token
   → Token stocké dans une Map (sessionId → refreshToken)
   → Redirection vers /host/{sessionId}?spotify=connected

3. Le dashboard détecte ?spotify=connected
   → Charge le Spotify Web Playback SDK
   → SDK appelle POST /api/spotify/token avec sessionId
   → Le backend échange le refresh token contre un access token court
   → Player initialisé, écoute l'event 'ready'

4. Device enregistré sur le socket
   → host:spotify-device envoie le deviceId au backend
   → La lecture des chansons se fait via l'API Spotify Connect
```

## 🎮 Modes de jeu

### Mode Quiz (Soirée)
- Une chanson aléatoire est jouée
- Les invités doivent deviner le titre ou l'artiste
- Points attribués selon la rapidité

### Mode Jukebox
- Les invités ajoutent des chansons à la file d'attente
- Vote collectif pour la prochaine chanson
- La roue choisit aléatoirement si égalité

## 🗄️ Persistance des données

| Couche | Description |
|---|---|
| **Mémoire** | Sessions actives dans une Map JavaScript (rapide, volatil) |
| **Fichier JSON** | `backend/data/session-*.json` — sauvegardé à chaque join/rejoin |
| **Supabase** | Optionnel — si `SUPABASE_URL` et `SUPABASE_ANON_KEY` sont configurés |

**Comportement :** Si le serveur redémarre, les sessions sont restaurées depuis les fichiers JSON. Si Supabase n'est pas configuré, tout fonctionne en fallback local.

## 🔧 Tunnel permanent (Tailscale Funnel)

**Pourquoi :** Spotify OAuth nécessite une URL de callback fixe. cloudflared génère une nouvelle URL à chaque lancement → le callback Spotify casse.

**Solution :** Tailscale Funnel donne une URL HTTPS permanente.

### Installation
```bash
# Installer Tailscale
winget install Tailscale.Tailscale
# Ou depuis tailscale.com/download

# Connecter (s'ouvre dans le navigateur)
"C:\Program Files\Tailscale\tailscale.exe" up

# Activer Funnel (1 clic sur le lien qui s'ouvre)
"C:\Program Files\Tailscale\tailscale.exe" funnel 3001
```

### Résultat
```
https://<machine-name>.<tailnet-id>.ts.net/  ← PERMANENT, ne change jamais
```

## 🛠️ Commandes utiles

### Backend
```bash
cd backend
npm install                    # Installer les dépendances
node src/index.js              # Lancer en dev (require .env)
NODE_ENV=production node src/index.js  # Lancer en production
```

### Frontend
```bash
cd frontend
npm install                    # Installer les dépendances
npm run dev                    # Dev avec HMR (sur :5173)
npm run build                  # Build uniquement
npm run build:backend          # Build + copie dans backend/public/
```

### Tunnel
```bash
# Permanent (recommandé)
"C:\Program Files\Tailscale\tailscale.exe" funnel 3001

# Temporaire
cloudflared tunnel --url http://localhost:3001
```

### Git
```bash
git add -A && git commit -m "message" && git push origin master
```

## 🔍 Dépannage

### "Connexion en cours..." ne se termine jamais
- Vérifie que l'URI de redirection dans le Spotify Dashboard correspond EXACTEMENT à celle configurée
- Vérifie que le tunnel est actif : `curl https://ton-url.ts.net/api/health`
- Vérifie les logs backend : les erreurs OAuth sont loggées dans la console

### "Le QR code ne marche pas"
- Vérifie que l'URL du QR est publique : elle doit pointer vers le tunnel, pas localhost
- `GET /api/config/url` doit retourner l'URL du tunnel
- Si tu es sur le dashboard du host, l'URL du QR s'auto-détecte

### "Les participants disparaissent au refresh"
- Normal si la session n'a pas été rejointe : les données sont en mémoire
- Si le host a appelé `host:rejoin-session`, les données sont restaurées depuis le fichier JSON
- Vérifie que `backend/data/` contient le fichier de la session

### "Page blanche après rebuild"
- Supprime le cache du navigateur (Ctrl+F5)
- Le PWA service worker a été retiré, mais le cache ancien peut persister

### Port 3001 déjà utilisé
```bash
netstat -ano | grep ":3001 .*LISTEN" | awk '{print $NF}' | xargs -I{} taskkill /F /PID {}
```

## 📋 Variables d'environnement

| Variable | Description | Requis |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Client ID de l'app Spotify | Oui (pour la musique) |
| `SPOTIFY_CLIENT_SECRET` | Client Secret de l'app Spotify | Oui (pour la musique) |
| `SPOTIFY_REDIRECT_URI` | URL de callback OAuth Spotify | Oui (ex: `https://...ts.net/api/spotify/callback`) |
| `PUBLIC_URL` | URL publique pour le QR code | Oui (ex: `https://...ts.net`) |
| `HOST_PASSWORD` | Mot de passe hôte | Optionnel (défaut: admin123) |
| `SUPABASE_URL` | URL du projet Supabase | Optionnel (fallback local JSON) |
| `SUPABASE_ANON_KEY` | Clé anonyme Supabase | Optionnel |

## 📚 Stack technique

| Technologie | Usage |
|---|---|
| **Node.js 24** | Runtime |
| **Express 5** | Serveur HTTP, routes API, SPA |
| **Socket.IO** | WebSocket temps réel (host ↔ guests) |
| **React 19** | UI frontend |
| **Vite 6** | Build frontend, HMR |
| **Spotify Web API** | Recherche, contrôle playback |
| **Spotify Web Playback SDK** | Lecture audio navigateur |
| **Tailscale Funnel** | Tunnel HTTPS permanent (gratuit) |
| **Cloudflared** | Tunnel de secours (temporaire) |
