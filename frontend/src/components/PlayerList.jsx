export default function PlayerList({ guests, compact }) {
  const sorted = [...guests].sort((a, b) => b.points - a.points);

  if (compact) {
    return (
      <div className="player-compact">
        {sorted.map(g => (
          <div key={g.username} className="player-chip">
            <span>{g.username}</span>
            <span className="player-chip-points">{g.points}</span>
          </div>
        ))}
        {sorted.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Aucun participant</span>}
      </div>
    );
  }

  return (
    <ul className="player-list">
      {sorted.map(g => (
        <li key={g.username} className="player-row">
          <span className="player-name">{g.username}</span>
          <span className="player-points">{g.points} pts</span>
        </li>
      ))}
      {sorted.length === 0 && <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>Aucun participant</div>}
    </ul>
  );
}