import { config } from '../config/index.js';

// State machine : MODE_QUIZ ↔ MODE_JUKEBOX
export const MODE = {
  LOBBY: 'MODE_LOBBY',         // attente des joueurs
  QUIZ: 'MODE_QUIZ',           // blind-test en cours
  JUKEBOX: 'MODE_JUKEBOX',     // jukebox libre + sabotages
  RECAP: 'MODE_RECAP',         // fin de soirée
};

export class GameState {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.mode = MODE.LOBBY;
    this.guests = new Map();         // username → Guest
    this.queue = [];                 // playlist_queue items
    this.currentTrack = null;
    this.quizRound = 0;
    this.quizEndsAt = null;          // timestamp absolu en ms pour le timer du quiz
    this.totalTracksPlayed = 0;
    this.songCountSinceLastQuiz = 0;
    this.quizAnswer = null;          // { title, artist } pour le blind-test en cours
    this.quizResponses = new Map();  // username → { answer, timestamp }
    this.createdAt = Date.now();
  }

  isHost() { return this.mode === MODE.LOBBY || this.mode === MODE.RECAP; }
  isPlaying() { return this.mode === MODE.QUIZ || this.mode === MODE.JUKEBOX; }

  addGuest(username) {
    if (this.guests.has(username)) return false;
    this.guests.set(username, {
      username,
      points: 0,
      likedGenres: [],
      hatedGenres: [],
      favoriteArtists: [],
      joinedAt: Date.now(),
    });
    return true;
  }

  removeGuest(username) {
    return this.guests.delete(username);
  }

  guestCount() {
    return this.guests.size;
  }

  skipThreshold() {
    const total = this.guestCount();
    return total > 0 ? Math.ceil(total * (config.game.skipThreshold || 0.5)) : 1;
  }

  setMode(newMode) {
    this.mode = newMode;
    return this.mode;
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      mode: this.mode,
      guests: Array.from(this.guests.entries()).map(([k, v]) => ({ username: k, points: v.points })),
      queue: this.queue,
      currentTrack: this.currentTrack,
      quizRound: this.quizRound,
      quizEndsAt: this.quizEndsAt,
      totalTracksPlayed: this.totalTracksPlayed,
      guestCount: this.guestCount(),
    };
  }
}