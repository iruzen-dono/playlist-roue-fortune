export default function QueueDisplay({ queue }) {
  if (!queue || queue.length === 0) {
    return <p style={{ color: '#8888aa' }}>File d'attente vide</p>;
  }

  return (
    <div>
      {queue.map((track, i) => (
        <div key={`${track.trackUri}-${i}`} style={styles.item}>
          <div style={styles.num}>#{i + 1}</div>
          <div style={styles.info}>
            <span style={styles.title}>{track.title}</span>
            <span style={styles.artist}> — {track.artist}</span>
            {track.contextReason && (
              <p style={styles.reason}>💡 {track.contextReason}</p>
            )}
          </div>
          <div style={styles.meta}>
            <span style={styles.source}>
              {track.insertedBy === 'AI_Jukebox' ? '🤖 IA' : `👤 ${track.insertedBy}`}
            </span>
            {(track.boostScore || 0) > 0 && (
              <span style={styles.boost}>
                🚀 +{track.boostScore}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const styles = {
  item: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '10px', borderBottom: '1px solid #2a2a5e',
  },
  num: { color: '#8888aa', fontWeight: 'bold', minWidth: '24px' },
  info: { flex: 1 },
  title: { fontWeight: 'bold' },
  artist: { color: '#8888aa', fontSize: '0.9rem' },
  reason: { color: '#ffd700', fontSize: '0.8rem', margin: '4px 0 0', fontStyle: 'italic' },
  meta: { textAlign: 'right', fontSize: '0.8rem' },
  source: { display: 'block', color: '#6666aa' },
  boost: { display: 'block', color: '#ffd700' },
};