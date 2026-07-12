import { config } from '../config/index.js';

// Service proxy pour l'API Spotify (contourne les quotas via Client Credentials)
// L'hôte gère le Web Playback SDK côté frontend

let accessToken = null;
let tokenExpiresAt = 0;

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

  const response = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
    { headers: { 'Authorization': `Bearer ${tk}` } }
  );

  if (response.status === 429) {
    console.warn('[Spotify] search error: 429, retrying in 1s...');
    await new Promise(r => setTimeout(r, 1000));
    const retry = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
      { headers: { 'Authorization': `Bearer ${tk}` } }
    );
    if (!retry.ok) return null;
    const data = await retry.json();
    return data.tracks?.items?.[0] || null;
  }

  if (!response.ok) {
    console.warn(`[Spotify] search error: ${response.status}`);
    return null;
  }

  const data = await response.json();
  return data.tracks?.items?.[0] || null;
}

// Recherche multiple : associer titre+artiste LLM → track_uri Spotify
export async function resolveTracks(trackList) {
  const results = [];
  for (const item of trackList) {
    const query = `${item.title} ${item.artist}`;
    const track = await searchTrack(query);
    results.push({
      ...item,
      trackUri: track?.uri || null,
      spotifyId: track?.id || null,
      resolved: !!track,
    });
    // Petit délai pour éviter rate limit
    await new Promise(r => setTimeout(r, 100));
  }
  return results;
}

// Recherche libre pour les invités
export async function searchTracks(query, limit = 10) {
  const tk = await ensureToken();
  if (!tk) return [];

  const response = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`,
    { headers: { 'Authorization': `Bearer ${tk}` } }
  );

  if (!response.ok) return [];
  const data = await response.json();
  return data.tracks?.items || [];
}