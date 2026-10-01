/**
 * Cloudflare Worker: real photo-based food recognition.
 *
 * Plain-JS copy of ../src/index.ts, for pasting directly into the Cloudflare
 * dashboard's "Quick edit" (which only accepts JavaScript, not TypeScript).
 * Keep this in sync with src/index.ts if that file changes.
 *
 * Deploy: paste this whole file into the Worker's Quick Edit, click Deploy,
 * then add a secret named GEMINI_API_KEY under Settings > Variables and
 * Secrets. Get a free key at https://aistudio.google.com/apikey.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Gemini's structured-output schema format (OpenAPI 3.0 subset, uppercase
// types). Kept deliberately flat (no nested objects) — Gemini's controlled
// generation is less reliable with deep nesting than it is with flat
// per-item fields.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    isFood: {
      type: 'BOOLEAN',
      description: 'False if the photo does not show food at all.',
    },
    unusable: {
      type: 'BOOLEAN',
      description:
        'True only if the photo is genuinely too blurry, dark, cropped, or distant to make even a rough quantity estimate for anything in it. Use this rarely — prefer a wide estimated-grams range over refusing.',
    },
    unusableReason: {
      type: 'STRING',
      description: 'Short, specific reason why the photo could not be analyzed. Only set when unusable is true.',
    },
    items: {
      type: 'ARRAY',
      description: 'One entry per distinct food item visible in the photo.',
      items: {
        type: 'OBJECT',
        properties: {
          seenDescription: {
            type: 'STRING',
            description:
              'FACTS ONLY: color, shape, texture, visible components — describe exactly what is visible, with no assumption about identity, weight, or preparation you cannot actually see.',
          },
          bestGuessName: {
            type: 'STRING',
            description: 'The most likely specific identification, e.g. "Grilled chicken breast", "White rice", "Caesar salad".',
          },
          identificationConfidence: {
            type: 'INTEGER',
            description: 'How confident you are in bestGuessName specifically, 0-100 (not the estimate quality).',
          },
          alternatives: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Other plausible identifications. Only include these when identificationConfidence is below 70 — otherwise leave empty.',
          },
          isCountable: {
            type: 'BOOLEAN',
            description: 'True when this item is naturally counted rather than weighed (eggs, bread slices, sushi pieces, fruit).',
          },
          unitCount: { type: 'NUMBER', description: 'Number of units, only when isCountable is true.' },
          unitLabel: { type: 'STRING', description: 'Unit name, e.g. "eggs", "slices", "pieces". Only when isCountable is true.' },
          estimatedGramsMin: { type: 'NUMBER', description: 'Low end of your honest weight/volume estimate in grams (or ml).' },
          estimatedGramsMax: { type: 'NUMBER', description: 'High end of your honest weight/volume estimate in grams (or ml).' },
          visibleExtras: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Sauces, oil sheen, cheese, dressing, etc. you can actually SEE on this item — not things you assume are there.',
          },
          per100gCalories: { type: 'NUMBER', description: 'Fallback per-100g calorie estimate, used only if this food is not in our own database.' },
          per100gProteinG: { type: 'NUMBER', description: 'Fallback per-100g protein grams.' },
          per100gCarbsG: { type: 'NUMBER', description: 'Fallback per-100g carb grams.' },
          per100gFatG: { type: 'NUMBER', description: 'Fallback per-100g fat grams.' },
          boxXPct: { type: 'NUMBER', description: 'Left edge of this item in the photo, as a 0-100 percentage of image width.' },
          boxYPct: { type: 'NUMBER', description: 'Top edge of this item in the photo, as a 0-100 percentage of image height.' },
          boxWPct: { type: 'NUMBER', description: 'Width of this item in the photo, as a 0-100 percentage of image width.' },
          boxHPct: { type: 'NUMBER', description: 'Height of this item in the photo, as a 0-100 percentage of image height.' },
        },
        required: [
          'seenDescription',
          'bestGuessName',
          'identificationConfidence',
          'estimatedGramsMin',
          'estimatedGramsMax',
          'per100gCalories',
          'per100gProteinG',
          'per100gCarbsG',
          'per100gFatG',
        ],
      },
    },
  },
  required: ['isFood', 'items'],
};

const SYSTEM_PROMPT = `You are a food-photo analysis system feeding a nutrition tracking app. Before answering, work through this exact protocol internally:
1. What is in the photo overall?
2. How many visually distinct food items are there?
3. Which region/part of the photo does each item occupy?
4. Is each region actually food, or something else (utensil, hand, label, background)?
5. For each food item, what is the most specific correct identification you can make?
6. How does it appear to be prepared (raw/cooked/fried/grilled/etc.), if visible?
7. What portion size does it look like, using reference objects in the frame (plate/bowl diameter, utensils, hands, packaging, common cup/glass sizes) to judge scale?
8. Are there visible sauces, oils, dressings, cheese, or toppings you can actually see (not ones you're assuming)?
9. Is this a packaged/branded product identifiable from its label?
10. Only after all of the above, produce per-100g nutrition estimates for the fallback fields.

Hard rules:
- Never state an assumption as if it were observed. seenDescription must contain only what is visually verifiable.
- Prefer counting discrete units (eggs, slices, pieces) over guessing a weight, whenever the item is naturally countable.
- Give an honest estimated-grams range; do not narrow it just to look precise. A wide range is more honest than a falsely narrow one.
- If your confidence in an identification is below 70, list real alternatives — do not silently pick one and hide the uncertainty.
- Only set "unusable" if the photo truly cannot support even a rough estimate — a blurry or partial photo is still usually estimable with a wider range, so use this field sparingly.
- boxXPct/boxYPct/boxWPct/boxHPct are optional — omit them entirely if you cannot judge the region confidently, rather than guessing.
Respond with ONLY the JSON object matching the given schema — no other text.`;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch (err) {
      console.error('Invalid JSON body from client:', String(err));
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const imageDataUrl = body.image;
    if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
      console.error('Missing or invalid image data URL. Prefix seen:', imageDataUrl?.slice(0, 30));
      return json({ error: 'Missing or invalid "image" data URL' }, 400);
    }

    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!match) {
      console.error('Could not parse image data URL, length was:', imageDataUrl.length);
      return json({ error: 'Could not parse image data URL' }, 400);
    }
    const [, mediaType, base64Data] = match;
    console.log('Received image:', mediaType, 'base64 length:', base64Data.length);

    if (!env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY secret is not set on this Worker.');
      return json({ error: 'Server not configured: missing GEMINI_API_KEY secret' }, 500);
    }
    // Defensive: a key pasted via a phone's clipboard/Notes app can pick up a
    // trailing newline or space, which silently breaks the API call.
    const apiKey = env.GEMINI_API_KEY.trim();

    // 'gemini-flash-latest' is Google's stable alias for whichever Flash
    // model is currently available — using a specific pinned version (e.g.
    // 'gemini-2.5-flash') breaks outright once Google retires that version.
    // Candidate list: if the primary model's pool is overloaded (503), try a
    // couple of alternate pools before giving up — different model ids often
    // have independent capacity, so one being busy doesn't mean they all are.
    const candidateModels = env.GEMINI_MODEL
      ? [env.GEMINI_MODEL]
      : ['gemini-flash-latest', 'gemini-2.0-flash', 'gemini-2.5-flash'];

    const geminiBody = JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: mediaType, data: base64Data } },
            { text: 'Analyze this food photo following your protocol.' },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    try {
      // Gemini's free tier occasionally returns 503 ("currently experiencing
      // high demand") or 429 (rate limited) — both are transient. Retry each
      // candidate model a couple of times with backoff, then move to the
      // next model, before finally giving up.
      const ATTEMPTS_PER_MODEL = 2;
      let geminiRes;
      let errText = '';
      let lastModelTried = candidateModels[0];
      outer: for (const candidateModel of candidateModels) {
        lastModelTried = candidateModel;
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${apiKey}`;
        for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
          console.log(`Calling Gemini model "${candidateModel}", attempt ${attempt}/${ATTEMPTS_PER_MODEL}, key length:`, apiKey.length);
          geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: geminiBody,
          });
          if (geminiRes.ok) break outer;

          errText = await geminiRes.text();
          const retryable = geminiRes.status === 503 || geminiRes.status === 429;
          console.error(`Gemini API error for model "${candidateModel}" (attempt ${attempt}/${ATTEMPTS_PER_MODEL}). Status:`, geminiRes.status, 'Body:', errText);
          if (!retryable) break outer;
          await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
        }
      }

      if (!geminiRes || !geminiRes.ok) {
        console.error('All Gemini attempts exhausted. Last model tried:', lastModelTried);
        return json({ error: `Vision API error: ${geminiRes?.status}`, detail: errText }, 502);
      }

      const data = await geminiRes.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        console.error('Gemini response had no text part. Full response:', JSON.stringify(data));
        return json({ error: 'Model did not return structured analysis', detail: JSON.stringify(data) }, 502);
      }

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        console.error('Could not JSON.parse model text:', text, 'Error:', String(err));
        return json({ error: 'Model returned malformed JSON', detail: text }, 502);
      }

      console.log('Recognition succeeded.');
      return json(parsed, 200);
    } catch (err) {
      console.error('Fetch to Gemini threw an exception:', String(err));
      return json({ error: 'Recognition request failed', detail: String(err) }, 502);
    }
  },
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}
