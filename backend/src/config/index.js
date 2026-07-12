import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',

  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:5173/api/spotify/callback',
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },

  llm: {
    provider: process.env.LLM_PROVIDER || 'openai',
    apiKey: process.env.LLM_API_KEY,
    endpoint: process.env.LLM_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions',
    model: process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
    // Cloudflare Workers AI (fallback si provider=cloudflare)
    cfAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cfApiToken: process.env.CLOUDFLARE_API_TOKEN,
    cfModel: process.env.CF_LLM_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  },

  session: {
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
    hostPassword: process.env.HOST_PASSWORD || 'admin123',
  },

  game: {
    blindTestRounds: 4,
    quizInterval: 4,          // toutes les 4 chansons en jukebox → round de quiz
    defaultPoints: 0,
    addTrackCost: 5,
    skipCost: 30,
    boostCost: 50,
    skipThreshold: 0.5,       // 50% des joueurs pour skipper
    quizTimer: 30,            // secondes par round blind-test
  },
};