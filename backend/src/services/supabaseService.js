import { createClient } from '@supabase/supabase-js';

let supabase = null;

export function initSupabase(url, anonKey) {
  if (!url || !anonKey) {
    console.warn('[supabase] No credentials — running without DB persistence');
    return null;
  }
  supabase = createClient(url, anonKey);
  return supabase;
}

export function getSupabase() {
  return supabase;
}

// Tables : guest_preferences, playlist_queue

export async function saveGuest(guest) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('guest_preferences')
    .upsert({
      session_id: guest.sessionId,
      username: guest.username,
      liked_genres: guest.likedGenres,
      hated_genres: guest.hatedGenres,
      favorite_artists: guest.favoriteArtists,
      current_points: guest.points ?? 0,
    }, { onConflict: 'session_id, username' })
    .select();
  if (error) console.error('[Supabase] saveGuest error:', error);
  return data;
}

export async function saveQueueItem(item) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('playlist_queue')
    .insert({
      session_id: item.sessionId,
      track_uri: item.trackUri,
      title: item.title,
      artist: item.artist,
      inserted_by: item.insertedBy,
      context_reason: item.contextReason || null,
      boost_score: item.boostScore || 0,
      skip_votes_count: item.skipVotesCount || 0,
    })
    .select();
  if (error) console.error('[Supabase] saveQueue error:', error);
  return data;
}

export async function getSessionGuests(sessionId) {
  if (!supabase) return [];
  const { data } = await supabase
    .from('guest_preferences')
    .select('*')
    .eq('session_id', sessionId);
  return data || [];
}