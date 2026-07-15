import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// ─── Interleave Queue ─────────────────────────────────────────
function interleaveQueue(queue) {
  const bySource = {};
  for (const track of queue) {
    const src = track.insertedBy;
    if (!bySource[src]) bySource[src] = [];
    bySource[src].push(track);
  }
  const sources = Object.keys(bySource);
  if (sources.length <= 1) return queue;
  const maxLen = Math.max(...sources.map(s => bySource[s].length));
  const result = [];
  for (let i = 0; i < maxLen; i++) {
    for (const src of sources) {
      if (bySource[src][i]) result.push(bySource[src][i]);
    }
  }
  return result;
}

describe('interleaveQueue', () => {
  it('renvoie la même queue si une seule source', () => {
    const q = [
      { title: 'A', insertedBy: 'AI_Jukebox' },
      { title: 'B', insertedBy: 'AI_Jukebox' },
    ];
    assert.equal(interleaveQueue(q), q);
  });

  it('alterne entre deux sources', () => {
    const q = [
      { title: 'A1', insertedBy: 'AI_Jukebox' },
      { title: 'B1', insertedBy: 'Alice' },
      { title: 'A2', insertedBy: 'AI_Jukebox' },
      { title: 'B2', insertedBy: 'Alice' },
    ];
    const result = interleaveQueue(q);
    assert.equal(result[0].title, 'A1');
    assert.equal(result[1].title, 'B1');
    assert.equal(result[2].title, 'A2');
    assert.equal(result[3].title, 'B2');
  });

  it('gère les sources de longueur inégale', () => {
    const q = [
      { title: 'A1', insertedBy: 'AI_Jukebox' },
      { title: 'A2', insertedBy: 'AI_Jukebox' },
      { title: 'A3', insertedBy: 'AI_Jukebox' },
      { title: 'B1', insertedBy: 'Bob' },
    ];
    const result = interleaveQueue(q);
    assert.equal(result[0].title, 'A1');
    assert.equal(result[1].title, 'B1');
    assert.equal(result[2].title, 'A2');
    assert.equal(result[3].title, 'A3');
  });

  it('queue vide', () => {
    assert.deepEqual(interleaveQueue([]), []);
  });
});

// ─── Fallback Quiz Rotation ───────────────────────────────────
const FALLBACK_QUIZZES = [
  { title: 'Smells Like Teen Spirit', artist: 'Nirvana' },
  { title: 'Billie Jean', artist: 'Michael Jackson' },
  { title: 'Bohemian Rhapsody', artist: 'Queen' },
  { title: 'Lose Yourself', artist: 'Eminem' },
];

function fallbackQuiz(alreadyPlayed, indexRef) {
  for (let i = 0; i < FALLBACK_QUIZZES.length; i++) {
    const candidate = FALLBACK_QUIZZES[indexRef.i % FALLBACK_QUIZZES.length];
    indexRef.i++;
    const label = `${candidate.title} - ${candidate.artist}`;
    if (!alreadyPlayed.includes(label)) return { ...candidate };
  }
  return { ...FALLBACK_QUIZZES[(indexRef.i++) % FALLBACK_QUIZZES.length] };
}

describe('fallbackQuiz', () => {
  it('retourne un quiz en évitant les déjà joués', () => {
    const played = ['Smells Like Teen Spirit - Nirvana', 'Billie Jean - Michael Jackson'];
    const ref = { i: 0 };
    const q = fallbackQuiz(played, ref);
    assert.notEqual(q.title, 'Smells Like Teen Spirit');
    assert.notEqual(q.title, 'Billie Jean');
    // Devrait retourner le 3ème fallback (Bohemian Rhapsody)
    assert.equal(q.title, 'Bohemian Rhapsody');
  });

  it('cycle si tous ont été joués', () => {
    const played = [
      'Smells Like Teen Spirit - Nirvana',
      'Billie Jean - Michael Jackson',
      'Bohemian Rhapsody - Queen',
      'Lose Yourself - Eminem',
    ];
    const ref = { i: 0 };
    const q = fallbackQuiz(played, ref);
    // Tous joués, reprend le cycle — tombe sur le 1er
    assert.equal(q.title, 'Smells Like Teen Spirit');
  });

  it('fonctionne avec une liste vide (premier round)', () => {
    const ref = { i: 0 };
    const q = fallbackQuiz([], ref);
    assert.equal(q.title, 'Smells Like Teen Spirit');
  });
});

// ─── Retry Backoff (logique pure) ─────────────────────────────
function computeDelay(attempt) {
  return Math.min(1000 * Math.pow(2, attempt - 1), 8000);
}

describe('retry backoff', () => {
  it('delay croît exponentiellement plafonné à 8000ms', () => {
    assert.equal(computeDelay(1), 1000);
    assert.equal(computeDelay(2), 2000);
    assert.equal(computeDelay(3), 4000);
    assert.equal(computeDelay(4), 8000);
    assert.equal(computeDelay(5), 8000); // plafonné
  });
});

// ─── Quiz Speed Scoring ────────────────────────────────────────
function quizScore(responseCount) {
  return Math.max(50, 150 - responseCount * 25);
}

describe('quizScore', () => {
  it('première réponse rapporte 150pts', () => {
    assert.equal(quizScore(0), 150);
  });
  it('deuxième réponse rapporte 125pts', () => {
    assert.equal(quizScore(1), 125);
  });
  it('plancher à 50pts à partir de 4 réponses', () => {
    assert.equal(quizScore(4), 50);
    assert.equal(quizScore(10), 50);
  });
});
