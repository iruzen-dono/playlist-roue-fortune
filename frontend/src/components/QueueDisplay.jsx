export default function QueueDisplay({ queue }) {
  if (!queue || queue.length === 0) {
    return <div className="queue-empty">File d'attente vide</div>;
  }

  return (
    <div>
      {queue.map((track, i) => (
        <div key={`${track.trackUri}-${i}`} className="queue-item">
          <div className="queue-pos">#{i + 1}</div>
          <div className="queue-info">
            <div className="queue-title">{track.title}</div>
            <div className="queue-artist">{track.artist}</div>
            {track.contextReason && (
              <div className="queue-reason">{track.contextReason}</div>
            )}
          </div>
          <div className="queue-meta">
            <span className="queue-source">
              {track.insertedBy === 'AI_Jukebox' ? 'IA' : track.insertedBy}
            </span>
            {(track.boostScore || 0) > 0 && (
              <span className="queue-boost">+{track.boostScore}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}