# 🎡 Playlist Roue de la Fortune

App gamifiée de soirée musicale — blind-test + jukebox collaboratif avec sabotages et boosts.

## Structure

```
playlist-roue-fortune/
├── backend/          # Node.js (Express + Socket.io)
├── frontend/         # React (Vite.js) PWA
└── README.md
```

## Stack

- **Frontend :** React 19 + Vite + PWA
- **Backend :** Node.js (Express/Fastify) + Socket.io
- **DB :** PostgreSQL via Supabase
- **LLM :** Groq ou Ollama (génération playlist + transitions)
- **Tunnel :** ngrok (accès invités)
- **API :** Spotify Web API + Web Playback SDK