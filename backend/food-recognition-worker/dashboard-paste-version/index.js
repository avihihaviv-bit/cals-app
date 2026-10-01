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
          estimationReasoning: {
            type: 'STRING',
            description: 'Which visual reference you used to judge scale — plate/bowl diameter, cutlery length, hand, packaging, cup size, etc.',
          },
          preparationMethod: { type: 'STRING', description: 'How it looks prepared (grilled, fried, raw, steamed…) if visible — omit if not determinable.' },
          visibleExtras: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Sauces, oil sheen, cheese, dressing, etc. you can actually SEE on this item — not things you assume are there.',
          },
          isPackagedProduct: { type: 'BOOLEAN', description: 'True if this is a packaged/branded product with visible label text.' },
          packageLabelText: { type: 'STRING', description: 'Any brand/product name text you can read on packaging, if isPackagedProduct.' },
          per100gEstimate: {
            type: 'OBJECT',
            description:
              'Your best-knowledge nutrition estimate per 100g/100ml of this specific food, from general knowledge — used ONLY as a fallback if the client cannot match this food in its own verified database. Always treated as an AI estimate, never as verified data.',
            properties: {
              calories: { type: 'NUMBER' },
              proteinG: { type: 'NUMBER' },
              carbsG: { type: 'NUMBER' },
              fatG: { type: 'NUMBER' },
            },
            required: ['calories', 'proteinG', 'carbsG', 'fatG'],
          },
          boundingBox: {
            type: 'OBJECT',
            description: 'Approximate location of this item in the image, as percentages (0-100) of image width/height, from the top-left corner.',
            properties: {
              xPct: { type: 'NUMBER' },
              yPct: { type: 'NUMBER' },
              wPct: { type: 'NUMBER' },
              hPct: { type: 'NUMBER' },
            },
          },
        },
        required: ['seenDescription', 'bestGuessName', 'identificationConfidence', 'estimatedGramsMin', 'estimatedGramsMax', 'per100gEstimate'],
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
10. Only after all of the above, produce per-100g nutrition estimates for the fallback field.

Hard rules:
- Never state an assumption as if it were observed. seenDescription must contain only what is visually verifiable.
- Prefer counting discrete units (eggs, slices, pieces) over guessing a weight, whenever the item is naturally countable.
- Give an honest estimated-grams range; do not narrow it just to look precise. A wide range is more honest than a falsely narrow one.
- If your confidence in an identification is below 70, list real alternatives — do not silently pick one and hide the uncertainty.
- Only set "unusable" if the photo truly cannot support even a rough estimate — a blurry or partial photo is still usually estimable with a wider range, so use this field sparingly.
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
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const imageDataUrl = body.image;
    if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
      return json({ error: 'Missing or invalid "image" data URL' }, 400);
    }

    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!match) {
      return json({ error: 'Could not parse image data URL' }, 400);
    }
    const [, mediaType, base64Data] = match;

    if (!env.GEMINI_API_KEY) {
      return json({ error: 'Server not configured: missing GEMINI_API_KEY secret' }, 500);
    }

    const model = env.GEMINI_MODEL || 'gemini-2.5-flash';

    try {
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
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
        }),
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        return json({ error: `Vision API error: ${geminiRes.status}`, detail: errText }, 502);
      }

      const data = await geminiRes.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        return json({ error: 'Model did not return structured analysis' }, 502);
      }

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return json({ error: 'Model returned malformed JSON' }, 502);
      }

      return json(parsed, 200);
    } catch (err) {
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
