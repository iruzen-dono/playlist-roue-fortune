import { config } from '../config/index.js';
import { GameState, MODE } from '../services/gameState.js';
import { generateInitialPlaylist, generateQuizTrack } from '../services/llmService.js';
import { searchTracks, resolveTracks } from '../services/spotifyService.js';
import { saveGuest } from '../services/supabaseService.js';
import { playTrack, pausePlayback, skipToNext, setDeviceId, getValidAccessToken } from '../services/spotifyOAuth.js';
import { saveGuestsToFile, loadGuestsFromFile } from '../services/localDb.js';

// Map sessionId → GameState
const sessions = new Map();

function getOrCreateSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new GameState(sessionId));
  }
  return sessions.get(sessionId);
}

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    let currentSession = null;
    let currentUsername = null;

    console.log(`[Socket] Connected: ${socket.id}`);

    // ─── HOST ACTIONS ──────────────────────────────────────────

    // Rejoindre une session existante (après refresh de la page host)
    socket.on('host:rejoin-session', async ({ sessionId }, callback) => {
      let game = sessions.get(sessionId);
      
      // Si la session n'existe plus en mémoire, tenter de la restaurer depuis le stockage local
      if (!game) {
        console.log(`[Host] Session ${sessionId} not in memory, attempting restore from localDb...`);
        const storedGuests = loadGuestsFromFile(sessionId);
        if (storedGuests && storedGuests.length > 0) {
          const { GameState } = await import('../services/gameState.js');
          game = new GameState(sessionId);
          for (const g of storedGuests) {
            game.guests.set(g.username, {
              username: g.username,
              points: g.points || 0,
              likedGenres: g.likedGenres || [],
              hatedGenres: g.hatedGenres || [],
              favoriteArtists: g.favoriteArtists || [],
            });
          }
          sessions.set(sessionId, game);
          console.log(`[Host] Session ${sessionId} restored from localDb with ${game.guests.size} guests`);
        } else {
          console.log(`[Host] Session ${sessionId} not found in localDb`);
          return callback?.({ error: 'Session not found', sessionId });
        }
      }

      socket.join(`session:${sessionId}`);
      socket.join(`host:${sessionId}`);
      console.log(`[Host] Rejoined ${sessionId}, room has ${io.sockets.adapter.rooms.get(`session:${sessionId}`)?.size} sockets`);
      currentSession = sessionId;

      callback?.({ ok: true, session: game.toJSON() });
    });

    socket.on('host:create-session', async ({ sessionId, password }, callback) => {
      console.log(`[Host] Create session: ${sessionId}`);
      if (password !== config.session.hostPassword) {
        console.log(`[Host] Invalid password for ${sessionId}`);
        return callback?.({ error: 'Invalid host password' });
      }

      const game = getOrCreateSession(sessionId);
      currentSession = sessionId;
      socket.join(`session:${sessionId}`);
      socket.join(`host:${sessionId}`);
      callback?.({ ok: true, session: game.toJSON() });
    });

    // Démarrage de la soirée → génération playlist + premier blind-test
    socket.on('host:start-evening', async ({ sessionId: payloadSessionId } = {}, callback) => {
      const sessionId = payloadSessionId || currentSession;
      const game = sessions.get(sessionId);
      if (!game || game.guestCount() === 0) {
        return callback?.({ error: 'Aucun invité dans la session' });
      }

      const guests = Array.from(game.guests.values()).map(g => ({
        username: g.username,
        likedGenres: g.likedGenres,
        hatedGenres: g.hatedGenres,
        favoriteArtists: g.favoriteArtists,
      }));

      try {
        // 1. Générer la playlist initiale via LLM
        const llmTracks = await generateInitialPlaylist(guests, config.llm);
        // 2. Résoudre les track_uri Spotify
        const resolved = await resolveTracks(llmTracks);

        // 3. Ajouter à la queue
        for (const track of resolved) {
          game.queue.push({
            ...track,
            trackUri: track.trackUri || null,
            insertedBy: 'AI_Jukebox',
            boostScore: 0,
            skipVotesCount: 0,
          });
        }

        // 4. Démarrer en MODE_QUIZ (blind-test d'abord)
        game.setMode(MODE.QUIZ);
        game.quizRound = 1;

        // 5. Générer le premier son à deviner
        const quizTrack = await generateQuizTrack(guests, config.llm);
        const resolvedQuiz = await resolveTracks([quizTrack]);
        game.quizAnswer = { title: resolvedQuiz[0].title, artist: resolvedQuiz[0].artist };
        game.currentTrack = resolvedQuiz[0];

        io.to(`session:${sessionId}`).emit('game:state-update', game.toJSON());
        io.to(`session:${sessionId}`).emit('quiz:start', {
          round: 1,
          timer: config.game.quizTimer,
        });

        callback?.({ ok: true, session: game.toJSON() });
      } catch (err) {
        console.error('[Start evening] Error:', err);
        callback?.({ error: err.message });
      }
    });

    socket.on('host:start-jukebox', () => {
      const game = sessions.get(currentSession);
      if (!game) return;
      game.setMode(MODE.JUKEBOX);
      game.songCountSinceLastQuiz = 0;
      io.to(`session:${currentSession}`).emit('game:state-update', game.toJSON());
      io.to(`session:${currentSession}`).emit('jukebox:open');
    });

    socket.on('host:next-track', () => {
      const game = sessions.get(currentSession);
      if (!game || game.queue.length === 0) return;

      // Vérifier si on doit intercaler un quiz
      game.totalTracksPlayed++;
      game.songCountSinceLastQuiz++;

      if (game.songCountSinceLastQuiz >= config.game.quizInterval) {
        // Relancer un quiz
        game.setMode(MODE.QUIZ);
        game.quizRound++;
        launchQuizRound(io, game, currentSession);
        return;
      }

      // Jouer le prochain morceau de la queue (interleaving ou FIFO)
      const next = game.queue.shift();
      game.currentTrack = next;
      io.to(`session:${currentSession}`).emit('game:next-track', next);
      io.to(`session:${currentSession}`).emit('game:state-update', game.toJSON());
    });

    socket.on('host:skip-current', ({ trackId }) => {
      const game = sessions.get(currentSession);
      if (!game || !game.currentTrack) return;
      game.currentTrack = null;
      io.to(`session:${currentSession}`).emit('jukebox:track-skipped', { trackId });
      socket.emit('host:advance');
    });

    // ─── SPOTIFY PLAYBACK ──────────────────────────────────────

    socket.on('host:spotify-device', ({ deviceId, sessionId }) => {
      if (!sessionId) return;
      setDeviceId(sessionId, deviceId);
      console.log(`[Spotify] Device registered for ${sessionId}: ${deviceId}`);
      io.to(`host:${sessionId}`).emit('spotify:device-ready');
    });

    socket.on('host:play-track', async ({ trackUri, positionMs = 0 }, callback) => {
      if (!currentSession) return callback?.({ error: 'No session' });
      try {
        await playTrack(currentSession, trackUri, positionMs);
        callback?.({ ok: true });
      } catch (err) {
        console.error('[Playback] play error:', err.message);
        callback?.({ error: err.message });
      }
    });

    socket.on('host:pause', async (_, callback) => {
      if (!currentSession) return;
      try {
        await pausePlayback(currentSession);
        callback?.({ ok: true });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    socket.on('host:next-track-playback', async (_, callback) => {
      if (!currentSession) return;
      try {
        await skipToNext(currentSession);
        callback?.({ ok: true });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    // ─── GUEST ACTIONS ─────────────────────────────────────────

    socket.on('guest:join', ({ sessionId, username, likedGenres, hatedGenres, favoriteArtists }, callback) => {
      const game = sessions.get(sessionId);
      console.log(`[Guest] Join attempt: ${username} → ${sessionId}, game exists: ${!!game}, room size: ${game ? io.sockets.adapter.rooms.get(`session:${sessionId}`)?.size : 'N/A'}`);
      if (!game) return callback?.({ error: 'Session not found' });

      const added = game.addGuest(username);
      if (!added) {
        // Le guest existe déjà — mettre à jour ses données (rejoin après refresh)
        console.log(`[Guest] ${username} rejoining ${sessionId}, updating data`);
        const existing = game.guests.get(username);
        if (existing) {
          existing.likedGenres = likedGenres || existing.likedGenres;
          existing.hatedGenres = hatedGenres || existing.hatedGenres;
          existing.favoriteArtists = favoriteArtists || existing.favoriteArtists;
        }
      }

      currentSession = sessionId;
      currentUsername = username;
      socket.join(`session:${sessionId}`);

      console.log(`[Guest] ${username} joined ${sessionId}, room now has ${io.sockets.adapter.rooms.get(`session:${sessionId}`)?.size} sockets`);

      // Enregistrer en DB (si configurée)
      saveGuest({ sessionId, username, likedGenres, hatedGenres, favoriteArtists, points: config.game.defaultPoints });

      // Mettre à jour le score du guest dans le state
      const guestData = game.guests.get(username);
      guestData.likedGenres = likedGenres || [];
      guestData.hatedGenres = hatedGenres || [];
      guestData.favoriteArtists = favoriteArtists || [];

      // Persistance locale (fallback quand Supabase absent)
      saveGuestsToFile(sessionId, game.guests);

      callback?.({ ok: true, session: game.toJSON() });
      io.to(`session:${sessionId}`).emit('game:state-update', game.toJSON());
    });

    // Recherche Spotify pour les invités
    socket.on('guest:search', async ({ query }, callback) => {
      try {
        const results = await searchTracks(query);
        callback?.({ tracks: results });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    // Ajouter un morceau à la file (coût en points)
    socket.on('guest:add-track', ({ track }, callback) => {
      const game = sessions.get(currentSession);
      if (!game) return callback?.({ error: 'No session' });

      const guest = game.guests.get(currentUsername);
      if (!guest || guest.points < config.game.addTrackCost) {
        return callback?.({ error: 'Points insuffisants' });
      }

      guest.points -= config.game.addTrackCost;
      game.queue.push({
        title: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        trackUri: track.uri,
        insertedBy: currentUsername,
        boostScore: 0,
        skipVotesCount: 0,
      });

      // Appliquer l'interleaving : replacer au bon endroit
      interleaveQueue(game);

      const sessionId = currentSession;
      io.to(`session:${sessionId}`).emit('game:state-update', game.toJSON());
      callback?.({ ok: true, points: guest.points });
    });

    // Voter SKIP
    socket.on('guest:vote-skip', ({ trackId }, callback) => {
      const game = sessions.get(currentSession);
      if (!game) return;

      const guest = game.guests.get(currentUsername);
      if (!guest || guest.points < config.game.skipCost) {
        return callback?.({ error: 'Points insuffisants' });
      }

      guest.points -= config.game.skipCost;
      const track = game.queue.find(t => t.trackUri === trackId) || game.currentTrack;
      if (track) {
        track.skipVotesCount = (track.skipVotesCount || 0) + 1;
      }

      // Vérifier seuil
      const threshold = game.skipThreshold();
      const totalVotes = track?.skipVotesCount || 0;

      const sessionId = currentSession;
      io.to(`session:${sessionId}`).emit('game:state-update', game.toJSON());

      if (totalVotes >= threshold) {
        // SKIP déclenché
        if (track && game.currentTrack?.trackUri === trackId) {
          game.currentTrack = null;
          io.to(`session:${sessionId}`).emit('jukebox:track-skipped', { trackId });
          io.to(`host:${sessionId}`).emit('host:advance');
        }
        callback?.({ skipped: true });
      } else {
        callback?.({ skipped: false, currentVotes: totalVotes, threshold });
      }
    });

    // Voter BOOST
    socket.on('guest:vote-boost', ({ trackId }, callback) => {
      const game = sessions.get(currentSession);
      if (!game) return;

      const guest = game.guests.get(currentUsername);
      if (!guest || guest.points < config.game.boostCost) {
        return callback?.({ error: 'Points insuffisants' });
      }

      guest.points -= config.game.boostCost;
      const trackIndex = game.queue.findIndex(t => t.trackUri === trackId);
      if (trackIndex > 0) {
        const [track] = game.queue.splice(trackIndex, 1);
        track.boostScore = (track.boostScore || 0) + 1;
        game.queue.splice(0, 0, track); // Mettre en 2ème position (après le current)
      }

      const sessionId = currentSession;
      io.to(`session:${sessionId}`).emit('game:state-update', game.toJSON());
      callback?.({ ok: true, points: guest.points });
    });

    // Réponse blind-test
    socket.on('guest:quiz-answer', ({ answer }, callback) => {
      const game = sessions.get(currentSession);
      if (!game || !game.quizAnswer) return;

      const normalized = s => s.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      const correctTitle = normalized(game.quizAnswer.title);
      const correctArtist = normalized(game.quizAnswer.artist);
      const userAnswer = normalized(answer);

      // Score basé sur la vitesse (bonus aux premiers)
      const responseTime = Date.now();
      const isCorrect = userAnswer.includes(correctTitle) || userAnswer.includes(correctArtist);
      const previousResponses = game.quizResponses.size;

      if (isCorrect && !game.quizResponses.has(currentUsername)) {
        const score = Math.max(50, 150 - previousResponses * 25);
        const guest = game.guests.get(currentUsername);
        if (guest) guest.points += score;
        game.quizResponses.set(currentUsername, { answer, score, time: responseTime });
      }

      callback?.({ correct: isCorrect });
    });

    // ─── DISCONNECT ────────────────────────────────────────────

    socket.on('disconnect', () => {
      if (currentSession && currentUsername) {
        const game = sessions.get(currentSession);
        if (game) {
          console.log(`[Socket] ${currentUsername} disconnected from ${currentSession}`);
          io.to(`session:${currentSession}`).emit('game:state-update', game.toJSON());
        }
      }
    });
  });
}

// ─── HELPERS ─────────────────────────────────────────────────

function interleaveQueue(game) {
  // Round-robin pondéré: alterner entre les joueurs et l'IA
  // Trie la queue en regroupant par source, puis alterne
  const bySource = {};
  for (const track of game.queue) {
    const source = track.insertedBy;
    if (!bySource[source]) bySource[source] = [];
    bySource[source].push(track);
  }

  const sources = Object.keys(bySource);
  const interleaved = [];
  let maxLen = Math.max(...sources.map(s => bySource[s].length));

  for (let i = 0; i < maxLen; i++) {
    for (const source of sources) {
      if (bySource[source][i]) {
        interleaved.push(bySource[source][i]);
      }
    }
  }

  game.queue = interleaved;
}

async function launchQuizRound(io, game, sessionId) {
  try {
    const guests = Array.from(game.guests.values());
    const quizTrack = await generateQuizTrack(guests, config.llm);
    const resolved = await resolveTracks([quizTrack]);
    game.quizAnswer = { title: resolved[0].title, artist: resolved[0].artist };
    game.currentTrack = resolved[0];
    game.quizResponses.clear();

    io.to(`session:${sessionId}`).emit('quiz:start', {
      round: game.quizRound,
      timer: config.game.quizTimer,
    });
    io.to(`session:${sessionId}`).emit('game:state-update', game.toJSON());
  } catch (err) {
    console.error('[Quiz] Failed to launch round:', err);
  }
}