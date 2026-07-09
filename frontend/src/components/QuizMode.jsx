import { useState, useEffect } from 'react';

export default function QuizMode({ round, timer, onSubmit }) {
  const [answer, setAnswer] = useState('');
  const [timeLeft, setTimeLeft] = useState(timer);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setTimeLeft(timer);
    setSubmitted(false);
    setAnswer('');

    if (timer <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [round, timer]);

  const handleSubmit = () => {
    if (!answer.trim() || submitted) return;
    onSubmit(answer.trim());
    setSubmitted(true);
  };

  return (
    <div style={styles.container}>
      <div style={styles.quizBanner}>
        🎯 Blind-Test — Round {round}
      </div>

      <div style={styles.timer}>
        {timeLeft > 0 ? (
          <span style={{
            ...styles.timeDisplay,
            color: timeLeft <= 10 ? '#ff6b6b' : '#4ade80',
          }}>
            {timeLeft}s
          </span>
        ) : (
          <span style={styles.timeUp}>⏰ Temps écoulé !</span>
        )}
      </div>

      <p style={styles.hint}>Quel morceau est en train de jouer ?</p>

      <input
        style={styles.input}
        placeholder="Titre ou artiste..."
        value={answer}
        onChange={e => setAnswer(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        disabled={submitted || timeLeft === 0}
      />

      {!submitted && timeLeft > 0 && (
        <button style={styles.button} onClick={handleSubmit}>
          🎤 Proposer !
        </button>
      )}

      {submitted && (
        <p style={styles.submittedText}>✅ Réponse envoyée !</p>
      )}

      {timeLeft === 0 && (
        <p style={styles.revealText}>Révélation en cours...</p>
      )}
    </div>
  );
}

const styles = {
  container: {
    background: '#1a1a3e',
    padding: '24px',
    borderRadius: '12px',
    textAlign: 'center',
    marginBottom: '16px',
    border: '1px solid #2a2a5e',
  },
  quizBanner: {
    background: 'linear-gradient(135deg, #ff6b35, #ff3c3c)',
    padding: '12px',
    borderRadius: '8px',
    fontWeight: 'bold',
    fontSize: '1.2rem',
    marginBottom: '16px',
  },
  timer: { fontSize: '3rem', fontWeight: 'bold', marginBottom: '12px' },
  timeDisplay: { fontSize: '3rem' },
  hint: { color: '#8888aa', marginBottom: '16px' },
  input: {
    width: '100%',
    padding: '14px',
    borderRadius: '8px',
    border: '1px solid #333',
    background: '#0f0f23',
    color: 'white',
    fontSize: '1.2rem',
    textAlign: 'center',
    boxSizing: 'border-box',
    marginBottom: '12px',
  },
  button: {
    width: '100%',
    padding: '14px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #4ade80, #22c55e)',
    color: 'white',
    fontSize: '1.1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  submittedText: { color: '#4ade80', fontWeight: 'bold' },
  revealText: { color: '#ffd700', fontWeight: 'bold' },
};