import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function sessionPath(sessionId) {
  return path.join(DATA_DIR, `session-${sanitize(sessionId)}.json`);
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Sauvegarder les guests d'une session dans un fichier JSON
export function saveGuestsToFile(sessionId, guestsMap) {
  try {
    ensureDataDir();
    const guestsData = Array.from(guestsMap.entries()).map(([k, v]) => ({
      username: k,
      points: v.points || 0,
      likedGenres: v.likedGenres || [],
      hatedGenres: v.hatedGenres || [],
      favoriteArtists: v.favoriteArtists || [],
      joinedAt: v.joinedAt || new Date().toISOString(),
    }));
    fs.writeFileSync(sessionPath(sessionId), JSON.stringify(guestsData, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[localDb] Error saving guests:', err.message);
    return false;
  }
}

// Restaurer les guests d'une session depuis le fichier
export function loadGuestsFromFile(sessionId) {
  try {
    const p = sessionPath(sessionId);
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return Array.isArray(raw) ? raw : [];
  } catch (err) {
    console.error('[localDb] Error loading guests:', err.message);
    return null;
  }
}
