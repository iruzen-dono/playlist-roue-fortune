import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useGame } from '../context/GameContext';
import { useGameEvents } from '../hooks/useGameEvents';
import QueueDisplay from '../components/QueueDisplay';

// ─── Bip Web Audio ───────────────────────────────────────────
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'square';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch { /* Web Audio pas dispo */ }
}

// ─── Toast → feedback rapide ─────────────────────────────────
function showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  Object.assign(el.style, {
    position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
    padding: '10px 20px', borderRadius: '8px', zIndex: 9999,
    background: type === 'error' ? '#b91c1c' : '#065f46',
    color: '#fff', fontSize: '0.9rem', fontWeight: 600,
    animation: 'fadeIn 0.2s ease-out',
  });
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 2000);
}

export default function GuestView() {
  const { sessionId } = useParams();
  const { socket } = useSocket();
  const game = useGame();
  useGameEvents();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [requestingTrack, setRequestingTrack] = useState(null);
  const [skipDisabled, setSkipDisabled] = useState(false);

  // Reconnexion automatique : ré-émettre guest:join à chaque (re)connexion
  useEffect(() => {
    if (!socket) return;
    const rejoin = () => {
      const saved = sessionStorage.getItem('guest-identity');
      if (!saved) return;
      try {
        const identity = JSON.parse(saved);
        if (identity.sessionId !== sessionId) return;
        socket.emit('guest:join', identity, (res) => {
          if (res?.session) game.updateFromState(res.session);
        });
      } catch (e) { /* sessionStorage corrompu */ }
    };
    socket.on('connect', rejoin);
    return () => socket.off('connect', rejoin);
  }, [socket, sessionId, game]);

  const searchTracks = () => {
    if (!searchQuery.trim()) return;
    socket.emit('guest:search', { query: searchQuery }, (res) => {
      setSearchResults(res.tracks || []);
    });
  };

  const addTrack = (track) => {
    if (requestingTrack === track.id) return;
    setRequestingTrack(track.id);
    socket.emit('guest:add-track', { track }, (res) => {
      setRequestingTrack(null);
      if (res.error) { showToast(res.error, 'error'); return; }
      setSearchResults([]);
      setSearchQuery('');
      showToast('Ajouté à la file !', 'success');
    });
  };

  const voteSkip = () => {
    if (skipDisabled || !game.currentTrack?.trackUri) return;
    setSkipDisabled(true);
    socket.emit('guest:vote-skip', { trackId: game.currentTrack?.trackUri }, (res) => {
      setSkipDisabled(false);
      if (res?.error) { showToast(res.error, 'error'); return; }
      if (res?.skipped) showToast('Morceau skip !', 'success');
      else showToast(`Skip: ${res.currentVotes || 0}/${res.threshold || '?'} votes`);
    });
  };

  const voteBoost = () => {
    const track = game.currentTrack;
    if (!track?.trackUri) return;
    socket.emit('guest:vote-boost', { trackId: track.trackUri }, (res) => {
      if (res?.error) { showToast(res.error, 'error'); return; }
      showToast('Boosté ! (+1 en tête de file)', 'success');
    });
  };

  const submitQuizAnswer = (answer) => {
    socket.emit('guest:quiz-answer', { answer }, (res) => {
      if (res?.correct) showToast('Bonne réponse !', 'success');
    });
  };

  return (
    <div className="guest-page">
      <div className="guest-header">
        <div>
          <div className="guest-title">{sessionId}</div>
        </div>
        <div className="points-badge">{game.playerPoints} pts</div>
      </div>

      {/* Loading overlay — génération du round en cours */}
      {game.quizLoading && (
        <div className="quiz-loading">
          <div className="quiz-loading-spinner" />
          <div className="quiz-loading-text">Génération du prochain round...</div>
        </div>
      )}

      {/* Quiz mode */}
      {game.mode === 'MODE_QUIZ' && !game.quizRevealed && (
        <QuizCard round={game.quizRound} timer={game.quizTimer} quizEndsAt={game.quizEndsAt} onSubmit={submitQuizAnswer} />
      )}

      {/* Résultats du blind-test (invité) */}
      {game.quizRevealed && game.quizResults && (
        <QuizResultsComponent round={game.quizResults.round} answer={game.quizResults.answer} results={game.quizResults.results} />
      )}

      {/* Jukebox mode */}
      {game.mode === 'MODE_JUKEBOX' && (
        <>
          {game.currentTrack && (
            <div className="panel now-playing" style={{ marginBottom: 16 }}>
              <div className="now-label">EN COURS</div>
              <div className="now-title">{game.currentTrack.title}</div>
              <div className="now-artist">{game.currentTrack.artist}</div>
              <div className="action-row">
                <button className="btn btn-danger" onClick={voteSkip} disabled={skipDisabled}>
                  {skipDisabled ? '...' : 'Skip'}
                </button>
                <button className="btn btn-secondary" onClick={voteBoost}>Boost</button>
              </div>
            </div>
          )}

          <div className="search-box">
            <input className="search-input" placeholder="Rechercher un morceau..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchTracks()} />
            <button className="search-btn" onClick={searchTracks}>→</button>
          </div>

          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map(track => (
                <div key={track.id} className="search-result-item">
                  <div className="search-result-info">
                    <div className="search-result-title">{track.name}</div>
                    <div className="search-result-artist">
                      {track.artists.map(a => a.name).join(', ')}
                    </div>
                  </div>
                  <button className="add-btn" onClick={() => addTrack(track)} disabled={requestingTrack === track.id}>
                    {requestingTrack === track.id ? '...' : '+5'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {game.mode === 'MODE_LOBBY' && (
        <div className="lobby-waiting">En attente que l'hôte lance la soirée...</div>
      )}
    </div>
  );
}

// ─── Résultats du quiz (invité) ──────────────────────────────
function QuizResultsComponent({ round, answer, results }) {
  const answerOk = answer && typeof answer === 'object';
  return (
    <div className="quiz-container quiz-results">
      <div className="quiz-header">Blind-test — Round {round}</div>
      <div className="quiz-answer-reveal">
        <div className="quiz-hint">🎯 C'était :</div>
        <div className="quiz-reveal-title">{answerOk ? answer.title : '—'}</div>
        <div className="quiz-reveal-artist">{answerOk ? answer.artist : '—'}</div>
      </div>

      {/* Résultats des joueurs */}
      {results && results.length > 0 && (
        <div className="results-table">
          <div className="results-table-header">
            <span>Joueur</span>
            <span>Réponse</span>
            <span>Score</span>
          </div>
          {results.map((r, i) => (
            <div key={i} className={`results-row ${r.score > 0 ? 'results-row-correct' : 'results-row-wrong'}`}>
              <span className="results-name">{r.username}</span>
              <span className="results-answer">{r.answer || '—'}</span>
              <span className="results-score">+{r.score}</span>
            </div>
          ))}
        </div>
      )}

      {(!results || results.length === 0) && (
        <div className="quiz-waiting">Aucune réponse reçue</div>
      )}

      <div className="quiz-waiting">En attente du round suivant...</div>
    </div>
  );
}

// ─── Carte quiz (question + timer) ───────────────────────────
function QuizCard({ round, timer, quizEndsAt, onSubmit }) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(timer);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    setSubmitted(false);
    setAnswer('');

    if (quizEndsAt) {
      const tick = () => {
        const remaining = Math.max(0, Math.round((quizEndsAt - Date.now()) / 1000));
        setTimeLeft(remaining);
        const total = timer || 30;
        setProgress((remaining / total) * 100);
      };
      tick();
      const id = setInterval(tick, 100);
      return () => clearInterval(id);
    }

    setTimeLeft(timer);
    setProgress(100);
    if (timer <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(interval); setProgress(0); return 0; }
        setProgress(((prev - 1) / timer) * 100);
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [round, timer, quizEndsAt]);

  // Bip sonore à 5s restantes
  useEffect(() => {
    if (timeLeft === 5) playBeep();
  }, [timeLeft]);

  const handleSubmit = () => {
    if (!answer.trim() || submitted) return;
    onSubmit(answer.trim());
    setSubmitted(true);
  };

  const barColor = progress > 50 ? '#22c55e' : progress > 20 ? '#eab308' : '#ef4444';

  return (
    <div className="quiz-container">
      <div className="quiz-header">Blind-test — Round {round}</div>
      <div className={`quiz-timer ${timeLeft <= 10 ? 'quiz-timer-danger' : 'quiz-timer-safe'}`}>
        {timeLeft > 0 ? `${timeLeft}s` : 'Temps !'}
      </div>

      {/* Barre de progression */}
      <div className="timer-bar-track">
        <div className="timer-bar-fill" style={{ width: `${progress}%`, background: barColor }} />
      </div>

      <div className="quiz-hint">Quel morceau est en train de jouer ?</div>
      {!submitted && timeLeft > 0 ? (
        <>
          <input className="quiz-input" placeholder="Titre ou artiste..." value={answer}
            onChange={e => setAnswer(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          <button className="btn btn-primary btn-full" onClick={handleSubmit}>Proposer</button>
        </>
      ) : (
        <div className={submitted ? 'quiz-submitted' : 'quiz-reveal'}>
          {submitted ? 'Réponse envoyée ✓' : 'Révélation...'}
        </div>
      )}
    </div>
  );
}
