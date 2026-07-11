import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useGame } from '../context/GameContext';
import { useGameEvents } from '../hooks/useGameEvents';
import QueueDisplay from '../components/QueueDisplay';

export default function GuestView() {
  const { sessionId } = useParams();
  const { socket } = useSocket();
  const game = useGame();
  useGameEvents();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const searchTracks = () => {
    if (!searchQuery.trim()) return;
    socket.emit('guest:search', { query: searchQuery }, (res) => {
      setSearchResults(res.tracks || []);
    });
  };

  const addTrack = (track) => {
    socket.emit('guest:add-track', { track }, (res) => {
      if (res.error) return alert(res.error);
      setSearchResults([]);
      setSearchQuery('');
    });
  };

  const voteSkip = () => {
    socket.emit('guest:vote-skip', { trackId: game.currentTrack?.trackUri }, (res) => {
      if (res?.error) alert(res.error);
    });
  };

  const voteBoost = (trackId) => {
    socket.emit('guest:vote-boost', { trackId }, (res) => {
      if (res?.error) alert(res.error);
    });
  };

  const submitQuizAnswer = (answer) => {
    socket.emit('guest:quiz-answer', { answer }, () => {});
  };

  return (
    <div className="guest-page">
      <div className="guest-header">
        <div>
          <div className="guest-title">{sessionId}</div>
        </div>
        <div className="points-badge">{game.playerPoints} pts</div>
      </div>

      {/* Quiz mode */}
      {game.mode === 'MODE_QUIZ' && (
        <QuizCard round={game.quizRound} timer={game.quizTimer} onSubmit={submitQuizAnswer} />
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
                <button className="btn btn-danger" onClick={voteSkip}>Skip</button>
                <button className="btn btn-secondary" onClick={() => voteBoost(game.currentTrack.trackUri)}>Boost</button>
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
                  <button className="add-btn" onClick={() => addTrack(track)}>+5</button>
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

function QuizCard({ round, timer, onSubmit }) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(timer);

  useState(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => prev <= 1 ? (clearInterval(interval), 0) : prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  });

  const handleSubmit = () => {
    if (!answer.trim() || submitted) return;
    onSubmit(answer.trim());
    setSubmitted(true);
  };

  return (
    <div className="quiz-container">
      <div className="quiz-header">Blind-test — Round {round}</div>
      <div className={`quiz-timer ${timeLeft <= 10 ? 'quiz-timer-danger' : 'quiz-timer-safe'}`}>
        {timeLeft > 0 ? `${timeLeft}s` : 'Temps !'}
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
          {submitted ? 'Réponse envoyée' : 'Révélation...'}
        </div>
      )}
    </div>
  );
}