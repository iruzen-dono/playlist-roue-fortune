// Spotify OAuth + Web Playback token management
// Stocke le refresh token en mémoire par sessionId
// Le frontend utilise le Web Playback SDK avec un token court

import { config } from '../config/index.js';

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-currently-playing',
];

const hostTokens = new Map(); // sessionId → { refreshToken, deviceId }

export function getHostTokens(sessionId) {
  return hostTokens.get(sessionId) || null;
}

export function setHostTokens(sessionId, refreshToken) {
  const existing = hostTokens.get(sessionId) || {};
  hostTokens.set(sessionId, { ...existing, refreshToken });
}

export function setDeviceId(sessionId, deviceId) {
  const existing = hostTokens.get(sessionId) || {};
  hostTokens.set(sessionId, { ...existing, deviceId });
}

// URL de redirection OAuth
export function getAuthUrl(sessionId) {
  const params = new URLSearchParams({
    client_id: config.spotify.clientId,
    response_type: 'code',
    redirect_uri: config.spotify.redirectUri,
    scope: SCOPES.join(' '),
    state: sessionId,
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

// Échange le code d'autorisation contre un refresh token
export async function exchangeCode(code) {
  const auth = Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.spotify.redirectUri,
    }),
  });

  if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
  return response.json();
}

// Rafraîchit un access token à partir du refresh token
export async function refreshAccessToken(refreshToken) {
  const auth = Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) throw new Error(`Token refresh failed: ${response.status}`);
  return response.json();
}

// Récupère un access token valide pour un sessionId
export async function getValidAccessToken(sessionId) {
  const tokens = hostTokens.get(sessionId);
  if (!tokens?.refreshToken) return null;

  const data = await refreshAccessToken(tokens.refreshToken);
  return data.access_token;
}

// Contrôle playback via l'API Spotify Connect
export async function playTrack(sessionId, trackUri, positionMs = 0) {
  // Attendre que le device soit enregistré (max 5s)
  let tokens = hostTokens.get(sessionId);
  for (let i = 0; i < 10 && !tokens?.deviceId; i++) {
    await new Promise(r => setTimeout(r, 500));
    tokens = hostTokens.get(sessionId);
  }
  if (!tokens?.deviceId) throw new Error('No Spotify device connected');

  const token = await getValidAccessToken(sessionId);
  if (!token) throw new Error('No Spotify token');

  const body = {
    uris: Array.isArray(trackUri) ? trackUri : [trackUri],
    position_ms: positionMs,
  };

  const response = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${tokens.deviceId}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (response.status === 404) {
    // Device not found — clear it so the frontend reconnects
    hostTokens.set(sessionId, { ...tokens, deviceId: null });
    throw new Error('Spotify device not found');
  }
  if (!response.ok && response.status !== 204) {
    throw new Error(`Play failed: ${response.status}`);
  }
}

export async function pausePlayback(sessionId) {
  const tokens = hostTokens.get(sessionId);
  if (!tokens?.deviceId) return;

  const token = await getValidAccessToken(sessionId);
  if (!token) return;

  await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${tokens.deviceId}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}` },
  });
}

export async function skipToNext(sessionId) {
  const tokens = hostTokens.get(sessionId);
  if (!tokens?.deviceId) return;

  const token = await getValidAccessToken(sessionId);
  if (!token) return;

  await fetch(`https://api.spotify.com/v1/me/player/next?device_id=${tokens.deviceId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
}
