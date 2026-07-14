// Service LLM — génération de playlist + transitions musicales
// OpenAI-compatible (Groq, etc.) ou Cloudflare Workers AI

const LLM_SYSTEM_PROMPT = `Tu es un DJ IA expert en transitions musicales et compromis collectifs.
Tu reçois les préférences musicales textuelles d'un groupe d'invités.
Ta mission : générer des morceaux de compromis qui :
1. Créent des ponts stylistiques entre les genres aimés
2. Bannissent STRICTEMENT les genres détestés listés
3. Surprennent agréablement — pas de hits overplayed
4. Sont disponibles sur Spotify (titres et artistes réels)

Règles STRICTES de format :
- Les clés DOIVENT être entre guillemets doubles : "title", "artist", "reason"
- Les chaînes DOIVENT être entre guillemets doubles : "Titre de la chanson"
- Tableau JSON valide UNIQUEMENT, rien d'autre
- Exemple : [{"title":"Smells Like Teen Spirit","artist":"Nirvana","reason":"..."}]`;

// Playlist de fallback si le LLM est indisponible
const FALLBACK_PLAYLIST = [
  { title: 'Blinding Lights', artist: 'The Weeknd', reason: 'Tube planétaire' },
  { title: 'Bohemian Rhapsody', artist: 'Queen', reason: 'Classique intemporel' },
  { title: 'Smells Like Teen Spirit', artist: 'Nirvana', reason: 'Hymne grunge' },
  { title: 'Billie Jean', artist: 'Michael Jackson', reason: 'Iconique' },
  { title: 'Hotel California', artist: 'Eagles', reason: 'Rock légendaire' },
  { title: 'Lose Yourself', artist: 'Eminem', reason: 'Hymne hip-hop' },
  { title: 'Rolling in the Deep', artist: 'Adele', reason: 'Soul puissante' },
  { title: 'Stairway to Heaven', artist: 'Led Zeppelin', reason: "Chef-d'oeuvre rock" },
  { title: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars', reason: 'Funk irrésistible' },
  { title: 'Take On Me', artist: 'a-ha', reason: 'Synth-pop culte' },
];

const FALLBACK_QUIZ = { title: 'Smells Like Teen Spirit', artist: 'Nirvana' };

function buildUserPrompt(preferences) {
  const summary = preferences.map((p, i) =>
    `Invitée ${i + 1} (${p.username}) :\n  - Genres aimés : ${p.likedGenres.join(', ')}\n` +
    `  - Genres détestés : ${p.hatedGenres.join(', ')}\n  - Artistes favoris : ${p.favoriteArtists.join(', ')}`
  ).join('\n\n');

  return `Voici les préférences du groupe d'invités pour une soirée de jeu musicale :

${summary}

Génère exactement 10 morceaux de compromis qui plairont au groupe.
Format JSON attendu :
[
  {
    "title": "Titre du morceau",
    "artist": "Artiste",
    "reason": "Justification courte de pourquoi ce morceau fonctionne pour ce groupe"
  }
]`;
}

async function callCFLLM(messages, llmConfig) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${llmConfig.cfAccountId}/ai/run/${llmConfig.cfModel}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${llmConfig.cfApiToken}`,
    },
    body: JSON.stringify({ messages, max_tokens: 2048 }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`CF LLM request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  if (!data.success) throw new Error(`CF LLM error: ${data.errors?.[0]?.message || 'unknown'}`);
  return data.result.response;
}

async function callOpenAILLM(messages, llmConfig, opts = {}) {
  const body = {
    model: llmConfig.model,
    messages,
    temperature: opts.temperature || 0.8,
  };
  if (opts.responseFormat) body.response_format = { type: 'json_object' };

  const response = await fetch(llmConfig.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${llmConfig.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty LLM response');
  return content;
}

async function callLLM(messages, llmConfig, opts = {}) {
  if (llmConfig.provider === 'cloudflare') {
    return callCFLLM(messages, llmConfig);
  }
  return callOpenAILLM(messages, llmConfig, opts);
}

export async function generateInitialPlaylist(guestPreferences, llmConfig) {
  try {
    const messages = [
      { role: 'system', content: LLM_SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(guestPreferences) },
    ];

    const content = await callLLM(messages, llmConfig, { temperature: 0.8, responseFormat: true });

    // Nettoyer et parser (CF Workers AI peut retourner du JS non strict ou un objet déjà parsé)
    if (typeof content === 'object') return content;

    const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const fixed = cleaned
        .replace(/([{,]\s*)(\w[\w$]*)(\s*:)/g, '$1"$2"$3')
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/\n\s*/g, ' ')
        .replace(/\s+/g, ' ');
      return JSON.parse(fixed);
    }
  } catch (err) {
    console.error('[LLM] generateInitialPlaylist failed, using fallback:', err.message);
    return [...FALLBACK_PLAYLIST];
  }
}

// Génération d'un blind-test round (un seul morceau surprise adapté au groupe)
export async function generateQuizTrack(guestPreferences, llmConfig) {
  try {
    const summary = guestPreferences.map(p => `${p.username}: ${p.favoriteArtists.slice(0, 2).join(', ')}`).join('; ');
    const messages = [
      { role: 'system', content: 'Tu es un expert musical. Propose UN morceau surprenant. Format JSON STRICT avec guillemets doubles : {"title":"...","artist":"..."}. UNIQUEMENT le JSON valide, rien d\'autre.' },
      { role: 'user', content: `Groupe : ${summary}` },
    ];

    const content = await callLLM(messages, llmConfig, { temperature: 0.9, responseFormat: true });

    // CF Workers AI retourne parfois déjà parsé
    if (typeof content === 'object') return content;

    const cleaned = content.replace(/```json?/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[LLM] generateQuizTrack failed, using fallback:', err.message);
    return { ...FALLBACK_QUIZ };
  }
}
