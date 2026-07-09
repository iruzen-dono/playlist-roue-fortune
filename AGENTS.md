# Playlist Roue de la Fortune — Agent Context

## Architecture
- Monorepo: `backend/` + `frontend/`
- State machine: `MODE_QUIZ` ↔ `MODE_JUKEBOX` via Socket.io
- Host Spotify Premium unique, invités sans compte

## Key Decisions
- QR code → ngrok tunnel pour l'accès invité (pas de HTTPS/CORS en local)
- LLM génère la playlist de départ + transitions (Groq/Ollama)
- Blind-test d'abord (warm-up, distribution des points)
- Interleaving round-robin pour la file d'attente (pas FIFO)

## Env
- `VITE_SPOTIFY_CLIENT_ID`
- `VITE_SPOTIFY_CLIENT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `LLM_API_KEY` (Groq ou Ollama endpoint)