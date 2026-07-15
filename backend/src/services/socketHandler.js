import { config } from '../config/index.js';
import { GameState, MODE } from '../services/gameState.js';
import { generateInitialPlaylist, generateQuizTrack } from '../services/llmService.js';
import { searchTracks, resolveTracks } from '../services/spotifyService.js';
import { playTrack, pausePlayback, skipToNext, setDeviceId, getValidAccessToken } from '../services/spotifyOAuth.js';
import { saveGuestsToFile, loadGuestsFromFile } from '../services/localDb.js';

//━━━ État global des parties ━━━
const sessions = new Map();
const playedQuizTracks = new Map(); // sessionId → [labels déjà joués]

//━━━ Rate limiter simple (par socket, par event) ━━━
const rateLimits = new Map();
function checkRate(socketId, event, maxPerMinute = 20) {
  const key = `${socketId}:${event}`;
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now - entry.windowStart > 60000) {
    rateLimits.set(key, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= maxPerMinute) return false;
  entry.count++;
  return true;
}
// Nettoyer les entrées périmées toutes les 5 min
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (now - entry.windowStart > 120000) rateLimits.delete(key);
  }
}, 300000);

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
              likedArtists: g.likedArtists || [],
              mood: g.mood || null,
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
    socket.on('host:start-evening', async ({ sessionId: payloadSessionId, hostPreferences } = {}, callback) => {
      const sessionId = payloadSessionId || currentSession;
      const game = sessions.get(sessionId);
      if (!game || game.guestCount() === 0) {
        return callback?.({ error: 'Aucun invité dans la session' });
      }

      if (hostPreferences) {
        game.hostPreferences = hostPreferences;
      }

      const guests = Array.from(game.guests.values()).map(g => ({
        username: g.username,
        likedGenres: g.likedGenres,
        hatedGenres: g.hatedGenres,
        favoriteArtists: g.favoriteArtists,
        likedArtists: g.likedArtists || [],
        mood: g.mood || null,
      }));

      // Ajouter les préférences de l'hôte en tête de liste (comme un guest "Hôte")
      const hostGuest = {
        username: 'Hôte',
        likedGenres: [],
        hatedGenres: [],
        favoriteArtists: (game.hostPreferences.likedArtists || []).map(a => a.name),
        likedArtists: game.hostPreferences.likedArtists || [],
        mood: game.hostPreferences.mood || null,
      };
      guests.unshift(hostGuest);

      try {
        // 1. Générer la playlist initiale via LLM
        const llmTracks = await generateInitialPlaylist(guests, config.llm);
        // 2. Résoudre les track_uri Spotify
        const resolved = await resolveTracks(llmTracks);
        for (const track of resolved) {
          if (!track.trackUri) continue;
          game.queue.push({
            ...track,
            trackUri: track.trackUri,
            insertedBy: 'AI_Jukebox',
            boostScore: 0,
            skipVotesCount: 0,
          });
        }

        // 4. Initialiser le suivi des quiz déjà joués
        const playedKey = `session:${sessionId}`;
        playedQuizTracks.set(sessionId, []);

        // 5. Générer le premier son à deviner
        io.to(`session:${sessionId}`).emit('quiz:loading');
        const quizTrack = await generateQuizTrack(guests, config.llm, []);
        const resolvedQuiz = await resolveTracks([quizTrack]);
        const quizLabel = `${resolvedQuiz[0].title} - ${resolvedQuiz[0].artist}`;
        playedQuizTracks.get(sessionId).push(quizLabel);
        game.quizAnswer = { title: resolvedQuiz[0].title, artist: resolvedQuiz[0].artist };
        game.currentTrack = resolvedQuiz[0];

        // 6. Maintenant qu'on a un quiz valide, passer en MODE_QUIZ
        game.setMode(MODE.QUIZ);
        game.quizRound = 1;

        // 7. Le fronted joue automatiquement via son useEffect(currentTrack) → host:play-track
        if (!resolvedQuiz[0].trackUri && !game.queue[0]?.trackUri) {
          console.warn('[Start evening] No playable track URIs (Spotify rate limit?)');
        }

        game.quizEndsAt = Date.now() + config.game.quizTimer * 1000;
        io.to(`session:${sessionId}`).emit('game:state-update', game.toJSON());
        io.to(`session:${sessionId}`).emit('quiz:start', {
          round: 1,
          timer: config.game.quizTimer,
          quizEndsAt: game.quizEndsAt,
        });

        callback?.({ ok: true, session: game.toJSON() });
      } catch (err) {
        console.error('[Start evening] Error:', err);
        io.to(`session:${sessionId}`).emit('quiz:launch-error', { message: 'Erreur initialisation — réessaie' });
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

    // Révélation du blind-test
    socket.on('host:reveal-quiz', async () => {
      const game = sessions.get(currentSession);
      if (!game || game.mode !== MODE.QUIZ) return;
      try { await pausePlayback(currentSession); } catch {}
      const results = [];
      for (const [username, resp] of game.quizResponses) {
        results.push({ username, answer: resp.answer, score: resp.score });
      }
      io.to(`session:${currentSession}`).emit('quiz:revealed', {
        answer: game.quizAnswer,
        results,
        round: game.quizRound,
      });
    });

    // Continuer après la révélation du quiz
    socket.on('host:continue-after-quiz', () => {
      const game = sessions.get(currentSession);
      if (!game) return;
      game.quizResponses.clear();
      const played = playedQuizTracks.get(currentSession) || [];
      if (game.quizRound < config.game.blindTestRounds) {
        game.quizRound++;
        launchQuizRound(io, game, currentSession, played);
      } else {
        game.setMode(MODE.JUKEBOX);
        game.songCountSinceLastQuiz = 0;
        game.currentTrack = null;
        io.to(`session:${currentSession}`).emit('game:state-update', game.toJSON());
        io.to(`session:${currentSession}`).emit('jukebox:open');
      }
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
        const played = playedQuizTracks.get(currentSession) || [];
        launchQuizRound(io, game, currentSession, played);
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

    socket.on('guest:join', ({ sessionId, username, likedGenres, hatedGenres, favoriteArtists, likedArtists, mood }, callback) => {
      if (!checkRate(socket.id, 'guest:join', 10)) return callback?.({ error: 'Trop de requêtes, attends un peu' });
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
          if (likedArtists) existing.likedArtists = likedArtists;
          if (mood) existing.mood = mood;
        }
      }

      currentSession = sessionId;
      currentUsername = username;
      socket.join(`session:${sessionId}`);

      console.log(`[Guest] ${username} joined ${sessionId}, room now has ${io.sockets.adapter.rooms.get(`session:${sessionId}`)?.size} sockets`);

      // Appliquer les préférences du formulaire au game state
      const guestData = game.guests.get(username);
      if (guestData) {
        guestData.likedGenres = likedGenres || guestData.likedGenres || [];
        guestData.hatedGenres = hatedGenres || guestData.hatedGenres || [];
        guestData.favoriteArtists = favoriteArtists || guestData.favoriteArtists || [];
        if (likedArtists) guestData.likedArtists = likedArtists;
        if (mood) guestData.mood = mood;
        guestData.connected = true;
      }

      // Persistance locale
      saveGuestsToFile(sessionId, game.guests);

      callback?.({ ok: true, session: game.toJSON() });
      io.to(`session:${sessionId}`).emit('game:state-update', game.toJSON());
    });

    // Recherche Spotify pour les invités
    socket.on('guest:search', async ({ query }, callback) => {
      if (!checkRate(socket.id, 'guest:search', 30)) return callback?.({ error: 'Trop de requêtes, attends un peu' });
      try {
        const results = await searchTracks(query);
        callback?.({ tracks: results });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    // Ajouter un morceau à la file (coût en points)
    socket.on('guest:add-track', ({ track }, callback) => {
      if (!checkRate(socket.id, 'guest:add-track', 10)) return callback?.({ error: 'Trop de requêtes' });
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
      if (!checkRate(socket.id, 'guest:vote-skip', 10)) return callback?.({ error: 'Trop de requêtes' });
      const game = sessions.get(currentSession);
      if (!game) return;

      const guest = game.guests.get(currentUsername);
      if (!guest || guest.points < config.game.skipCost) {
        return callback?.({ error: 'Points insuffisants' });
      }

      const track = game.queue.find(t => t.trackUri === trackId) || game.currentTrack;
      if (!track) return callback?.({ error: 'Morceau introuvable' });

      // Dédoublonnage : un seul vote par joueur par morceau
      if (!track.skipVoters) track.skipVoters = [];
      if (track.skipVoters.includes(currentUsername)) {
        return callback?.({ error: 'Tu as déjà voté pour ce morceau' });
      }

      guest.points -= config.game.skipCost;
      track.skipVoters.push(currentUsername);
      track.skipVotesCount = track.skipVoters.length;

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
    socket.on('guest:vote-boost', async ({ trackId }, callback) => {
      if (!checkRate(socket.id, 'guest:vote-boost', 10)) return callback?.({ error: 'Trop de requêtes' });
      const game = sessions.get(currentSession);
      if (!game) return;

      const guest = game.guests.get(currentUsername);
      if (!guest || guest.points < config.game.boostCost) {
        return callback?.({ error: 'Points insuffisants' });
      }

      const trackIndex = game.queue.findIndex(t => t.trackUri === trackId);
      if (trackIndex === -1) return callback?.({ error: 'Morceau introuvable dans la file' });

      const track = game.queue[trackIndex];
      // Dédoublonnage
      if (!track.boostVoters) track.boostVoters = [];
      if (track.boostVoters.includes(currentUsername)) {
        return callback?.({ error: 'Tu as déjà boosté ce morceau' });
      }

      guest.points -= config.game.boostCost;
      track.boostVoters.push(currentUsername);
      track.boostScore = (track.boostScore || 0) + 1;
      // Mettre en 2ème position (après le current)
      const [boosted] = game.queue.splice(trackIndex, 1);
      game.queue.splice(0, 0, boosted);

      const sessionId = currentSession;
      io.to(`session:${sessionId}`).emit('game:state-update', game.toJSON());
      callback?.({ ok: true, points: guest.points });
    });

    // Répondre au blind-test
    socket.on('guest:quiz-answer', ({ answer, responseTime }, callback) => {
      if (!checkRate(socket.id, 'guest:quiz-answer', 30)) return callback?.({ error: 'Trop de requêtes' });
      const game = sessions.get(currentSession);
      if (!game || game.mode !== MODE.QUIZ) return callback?.({ error: 'Pas de quiz en cours' });

      const normalized = s => s.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      const correctTitle = normalized(game.quizAnswer.title);
      const correctArtist = normalized(game.quizAnswer.artist);
      const userAnswer = normalized(answer);

      // Score basé sur la vitesse (bonus aux premiers)
      const receivedAt = Date.now();
      const isCorrect = userAnswer.includes(correctTitle) || userAnswer.includes(correctArtist);
      const previousResponses = game.quizResponses.size;

      if (isCorrect && !game.quizResponses.has(currentUsername)) {
        const score = Math.max(50, 150 - previousResponses * 25);
        const guest = game.guests.get(currentUsername);
        if (guest) guest.points += score;
        game.quizResponses.set(currentUsername, { answer, score, time: receivedAt });
      }

      callback?.({ correct: isCorrect });
    });

    // ─── DISCONNECT ────────────────────────────────────────────

    socket.on('disconnect', () => {
      if (currentSession && currentUsername) {
        const game = sessions.get(currentSession);
        if (game) {
          console.log(`[Socket] ${currentUsername} disconnected from ${currentSession}`);
          const guest = game.guests.get(currentUsername);
          if (guest) guest.connected = false;
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

// Map des sessions en train de lancer un quiz round (anti-double-click)
const launchingQuiz = new Set();

async function launchQuizRound(io, game, sessionId, alreadyPlayed = []) {
  if (launchingQuiz.has(sessionId)) {
    console.log('[Quiz] Already launching round for session', sessionId, '— skipped');
    return;
  }

  launchingQuiz.add(sessionId);
  io.to(`session:${sessionId}`).emit('quiz:loading');
  try {
    const guests = Array.from(game.guests.values());
    const quizTrack = await generateQuizTrack(guests, config.llm, alreadyPlayed);
    const resolved = await resolveTracks([quizTrack]);
    const label = `${resolved[0].title} - ${resolved[0].artist}`;
    alreadyPlayed.push(label);
    game.quizAnswer = { title: resolved[0].title, artist: resolved[0].artist };
    game.currentTrack = resolved[0];
    game.quizResponses.clear();

    // Le frontend joue automatiquement via son useEffect(currentTrack) → host:play-track

    game.quizEndsAt = Date.now() + config.game.quizTimer * 1000;
    io.to(`session:${sessionId}`).emit('game:state-update', game.toJSON());
    io.to(`session:${sessionId}`).emit('quiz:start', {
      round: game.quizRound,
      timer: config.game.quizTimer,
      quizEndsAt: game.quizEndsAt,
    });
  } catch (err) {
    console.error('[Quiz] Failed to launch round:', err);
    game.quizRound = Math.max(1, game.quizRound - 1);
    io.to(`session:${sessionId}`).emit('quiz:launch-error', { message: 'Erreur génération round — réessaie' });
  } finally {
    launchingQuiz.delete(sessionId);
  }
}

export { launchQuizRound };