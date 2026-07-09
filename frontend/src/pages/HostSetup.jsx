import { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useGame } from '../context/GameContext';
import { useNavigate } from 'react-router-dom';

export default function HostSetup() {
  const { socket } = useSocket();
  const game = useGame();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [sessionId, setSessionId] = useState(`s-${Date.now().toString(36)}`);
  const [error, setError] = useState('');

  const createSession = () => {
    if (!password) return setError('Mot de passe requis');
    socket.emit('host:create-session', { sessionId, password }, (res) => {
      if (res.error) return setError(res.error);
      game.setSessionId(sessionId);
      game.setIsHost(true);
      navigate(`/host/${sessionId}`);
    });
  };

  return (
    <div className="page">
      <div className="card">
        <div className="card-header">
          <div className="logo">Roue de la Fortune</div>
          <div className="subtitle">Soirée musicale interactive</div>
        </div>

        <div className="field">
          <label className="label">Nom de la session</label>
          <input
            className="input"
            value={sessionId}
            onChange={e => setSessionId(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="label">Mot de passe hôte</label>
          <input
            className="input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>

        {error && <div className="error">{error}</div>}

        <button className="btn btn-primary btn-full" onClick={createSession}>
          Créer la session
        </button>
      </div>
    </div>
  );
}