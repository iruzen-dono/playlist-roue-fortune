import { config } from '../config/index.js';

// Service proxy pour l'API Spotify (contourne les quotas via Client Credentials)
// L'hôte gère le Web Playback SDK côté frontend

let accessToken = null;
let tokenExpiresAt = 0;

// Retry helper avec exponential backoff pour les rate limits (429)
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.status !== 429) return response;

    if (attempt < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      console.warn(`[Spotify] Rate limited (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  // Dernière tentative — on laisse l'erreur remonter
  throw new Error(`Spotify rate limited after ${maxRetries} retries`);
}

async function getClientCredentialsToken() {
  const { clientId, clientSecret } = config.spotify;
  if (!clientId || !clientSecret) return null;

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });

  if (!response.ok) throw new Error(`Spotify auth failed: ${response.status}`);
  const data = await response.json();
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  accessToken = data.access_token;
  return accessToken;
}

async function ensureToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60000) return accessToken;
  return getClientCredentialsToken();
}

// Recherche de morceaux par titre + artiste
async function searchTrack(query) {
  const tk = await ensureToken();
  if (!tk) return null;

  const response = await fetchWithRetry(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
    { headers: { 'Authorization': `Bearer ${tk}` } }
  );

  if (response.status === 429) return null; // déjà retryé dans fetchWithRetry

  if (!response.ok) {
    console.warn(`[Spotify] search error: ${response.status}`);
    return null;
  }

  const data = await response.json();
  return data.tracks?.items?.[0] || null;
}

// Recherche multiple : associer titre+artiste LLM → track_uri Spotify
export async function resolveTracks(trackList, concurrency = 3) {
  const results = [];

  for (let i = 0; i < trackList.length; i += concurrency) {
    const batch = trackList.slice(i, i + concurrency);
    const resolved = await Promise.all(batch.map(async (item) => {
      const query = `${item.title} ${item.artist}`;
      const track = await searchTrack(query);
      return {
        ...item,
        trackUri: track?.uri || null,
        spotifyId: track?.id || null,
        resolved: !!track,
      };
    }));
    results.push(...resolved);
  }

  return results;
}

// Recherche libre pour les invités
export async function searchTracks(query, limit = 10) {
  const tk = await ensureToken();
  if (!tk) return [];

  const response = await fetchWithRetry(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`,
    { headers: { 'Authorization': `Bearer ${tk}` } }
  );

  if (!response.ok) return [];
  const data = await response.json();
  return data.tracks?.items || [];
}

// Recherche d'artistes (pour le onboarding visuel)
export async function searchArtists(query, limit = 5) {
  const tk = await ensureToken();
  if (!tk) return null;

  const response = await fetchWithRetry(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=${limit}`,
    { headers: { 'Authorization': `Bearer ${tk}` } }
  );

  if (!response.ok) return null;
  const data = await response.json();
  return data.artists?.items?.[0] || null;
}
