// Service LLM — génération de playlist + transitions musicales
// Groq (ou Ollama) pour analyse des préférences et propositions

const LLM_SYSTEM_PROMPT = `Tu es un DJ IA expert en transitions musicales et compromis collectifs.
Tu reçois les préférences musicales textuelles d'un groupe d'invités.
Ta mission : générer des morceaux de compromis qui :
1. Créent des ponts stylistiques entre les genres aimés
2. Bannissent STRICTEMENT les genres détestés listés
3. Surprennent agréablement — pas de hits overplayed
4. Sont disponibles sur Spotify (titres et artistes réels)

Réponds UNIQUEMENT avec un tableau JSON valide, rien d'autre.`;

function buildUserPrompt(preferences) {
  const summary = preferences.map((p, i) =>
    `Invitée ${i + 1} (${p.username}) :\n  - Genres aimés : ${p.likedGenres.join(', ')}\n` +
    `  - Genres détestés : ${p.hatedGenres.join(', ')}\n  - Artistes favoris : ${p.favoriteArtists.join(', ')}`
  ).join('\n\n');

  return `Voici les préférences du groupe d'invités pour une soirée de jeu musicale :

${summary}

Génère exactement 20 morceaux de compromis qui plairont au groupe.
Format JSON attendu :
[
  {
    "title": "Titre du morceau",
    "artist": "Artiste",
    "reason": "Justification courte de pourquoi ce morceau fonctionne pour ce groupe"
  }
]`;
}

export async function generateInitialPlaylist(guestPreferences, llmConfig) {
  const { apiKey, endpoint, model } = llmConfig;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: LLM_SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(guestPreferences) },
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) throw new Error('Empty LLM response');

  // Nettoyer et parser
  const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

// Génération d'un blind-test round (un seul morceau surprise adapté au groupe)
export async function generateQuizTrack(guestPreferences, llmConfig) {
  const { apiKey, endpoint, model } = llmConfig;
  const summary = guestPreferences.map(p => `${p.username}: ${p.favoriteArtists.slice(0, 2).join(', ')}`).join('; ');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Tu es un expert musical. Propose UN morceau surprenant et moins connu que le groupe doit deviner. Format JSON : {"title": "...", "artist": "..."}. UNIQUEMENT le JSON.' },
        { role: 'user', content: `Groupe : ${summary}` },
      ],
      temperature: 0.9,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) throw new Error(`LLM quiz request failed: ${response.status}`);

  const data = await response.json();
  const cleaned = data.choices[0].message.content.replace(/```json?/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}