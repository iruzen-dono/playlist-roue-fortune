export default function PlayerList({ guests, compact }) {
  const sorted = [...guests].sort((a, b) => b.points - a.points);

  if (compact) {
    return (
      <div style={styles.compactRow}>
        {sorted.map(g => (
          <div key={g.username} style={styles.compactBadge}>
            <span>{g.username}</span>
            <span style={styles.badgePts}>{g.points}🪙</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <ul style={styles.list}>
      {sorted.map(g => (
        <li key={g.username} style={styles.item}>
          <span style={styles.name}>{g.username}</span>
          <span style={styles.points}>{g.points} 🪙</span>
        </li>
      ))}
      {sorted.length === 0 && <li style={styles.empty}>Aucun joueur...</li>}
    </ul>
  );
}

const styles = {
  list: { listStyle: 'none', padding: 0, margin: 0 },
  item: {
    display: 'flex', justifyContent: 'space-between', padding: '8px 12px',
    borderBottom: '1px solid #2a2a5e', fontSize: '1rem',
  },
  name: { fontWeight: 'bold' },
  points: { color: '#ffd700' },
  empty: { color: '#8888aa', textAlign: 'center', padding: '10px' },
  compactRow: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' },
  compactBadge: {
    background: '#2a2a5e', padding: '4px 12px', borderRadius: '16px',
    display: 'flex', gap: '6px', fontSize: '0.85rem',
  },
  badgePoints: { color: '#ffd700' },
};