import { readFileSync } from 'fs';
import { searchArtists } from './spotifyService.js';

const CACHE_TTL = 60 * 60 * 1000; // 1h
let cachedData = null;
let cacheTime = 0;

/**
 * Retourne la liste des artistes curated avec leurs infos Spotify
 * (nom, id, image, genres). Cache 1h en mémoire.
 */
export async function getCuratedArtists() {
  if (cachedData && Date.now() - cacheTime < CACHE_TTL) {
    return cachedData;
  }

  const raw = JSON.parse(readFileSync(new URL('../data/curated-artists.json', import.meta.url), 'utf-8'));
  const results = [];

  // Chercher chaque artiste sur Spotify (batch de 5 pour pas flinguer l'API)
  for (let i = 0; i < raw.length; i += 5) {
    const batch = raw.slice(i, i + 5);
    const searched = await Promise.all(
      batch.map(async (a) => {
        try {
          const spotifyArtist = await searchArtists(a.name);
          if (!spotifyArtist) {
            return { name: a.name, id: null, image: null, genres: [], mood: a.mood };
          }
          return {
            name: spotifyArtist.name,
            id: spotifyArtist.id,
            image: spotifyArtist.images?.[0]?.url || null,
            genres: spotifyArtist.genres || [],
            mood: a.mood,
          };
        } catch (err) {
          console.warn(`[ArtistDiscovery] Failed to fetch ${a.name}:`, err.message);
          return { name: a.name, id: null, image: null, genres: [], mood: a.mood };
        }
      })
    );
    results.push(...searched);
  }

  cachedData = results;
  cacheTime = Date.now();
  return results;
}

/**
 * Recherche en direct un artiste Spotify par nom
 */
export async function searchArtist(query) {
  try {
    const spotifyArtist = await searchArtists(query);
    if (!spotifyArtist) return null;
    return {
      name: spotifyArtist.name,
      id: spotifyArtist.id,
      image: spotifyArtist.images?.[0]?.url || null,
      genres: spotifyArtist.genres || [],
    };
  } catch (err) {
    console.warn(`[ArtistDiscovery] Search failed for "${query}":`, err.message);
    return null;
  }
}
