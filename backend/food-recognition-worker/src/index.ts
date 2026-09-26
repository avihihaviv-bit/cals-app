/**
 * Cloudflare Worker: real photo-based food recognition.
 *
 * Receives a food photo from the app, sends it to a vision-capable Claude
 * model with a strict analysis protocol, and returns structured JSON that
 * separates what was actually SEEN in the photo from what is ESTIMATED.
 * The Worker never invents nutrition numbers itself — it only forwards the
 * model's per-100g composition guess; the client always does the
 * grams/100 * per100g multiplication, and prefers its own verified database
 * over the model's guess whenever the food matches a known entry.
 *
 * Deploy: see README.md in this folder. Requires `wrangler secret put
 * ANTHROPIC_API_KEY` — the key is never embedded in client code or this
 * repo, only stored as a Worker secret.
 */

export interface Env {
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_MODEL: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ANALYSIS_TOOL = {
  name: 'report_food_analysis',
  description:
    'Report a structured analysis of a food photo. Strictly separate facts (what you can actually see) from estimates (quantity, nutrition). Never state an estimate as if it were an observed fact.',
  input_schema: {
    type: 'object',
    properties: {
      isFood: {
        type: 'boolean',
        description: 'False if the photo does not show food at all.',
      },
      unusable: {
        type: 'boolean',
        description:
          'True only if the photo is genuinely too blurry, dark, cropped, or distant to make even a rough quantity estimate for anything in it. Use this rarely — prefer a wide estimated-grams range over refusing.',
      },
      unusableReason: {
        type: 'string',
        description: 'Short, specific reason why the photo could not be analyzed. Only set when unusable is true.',
      },
      items: {
        type: 'array',
        description: 'One entry per distinct food item visible in the photo.',
        items: {
          type: 'object',
          properties: {
            seenDescription: {
              type: 'string',
              description:
                'FACTS ONLY: color, shape, texture, visible components — describe exactly what is visible, with no assumption about identity, weight, or preparation you cannot actually see.',
            },
            bestGuessName: {
              type: 'string',
              description: 'The most likely specific identification, e.g. "Grilled chicken breast", "White rice", "Caesar salad".',
            },
            identificationConfidence: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              description: 'How confident you are in bestGuessName specifically (not the estimate quality).',
            },
            alternatives: {
              type: 'array',
              items: { type: 'string' },
              description: 'Other plausible identifications. Only include these when identificationConfidence is below 70 — otherwise leave empty.',
            },
            isCountable: {
              type: 'boolean',
              description: 'True when this item is naturally counted rather than weighed (eggs, bread slices, sushi pieces, fruit).',
            },
            unitCount: { type: 'number', description: 'Number of units, only when isCountable is true.' },
            unitLabel: { type: 'string', description: 'Unit name, e.g. "eggs", "slices", "pieces". Only when isCountable is true.' },
            estimatedGramsMin: { type: 'number', description: 'Low end of your honest weight/volume estimate in grams (or ml).' },
            estimatedGramsMax: { type: 'number', description: 'High end of your honest weight/volume estimate in grams (or ml).' },
            estimationReasoning: {
              type: 'string',
              description: 'Which visual reference you used to judge scale — plate/bowl diameter, cutlery length, hand, packaging, cup size, etc.',
            },
            preparationMethod: { type: 'string', description: 'How it looks prepared (grilled, fried, raw, steamed…) if visible — omit if not determinable.' },
            visibleExtras: {
              type: 'array',
              items: { type: 'string' },
              description: 'Sauces, oil sheen, cheese, dressing, etc. you can actually SEE on this item — not things you assume are there.',
            },
            isPackagedProduct: { type: 'boolean', description: 'True if this is a packaged/branded product with visible label text.' },
            packageLabelText: { type: 'string', description: 'Any brand/product name text you can read on packaging, if isPackagedProduct.' },
            per100gEstimate: {
              type: 'object',
              description:
                'Your best-knowledge nutrition estimate per 100g/100ml of this specific food, from general knowledge — used ONLY as a fallback if the client cannot match this food in its own verified database. Always treated as an AI estimate, never as verified data.',
              properties: {
                calories: { type: 'number' },
                proteinG: { type: 'number' },
                carbsG: { type: 'number' },
                fatG: { type: 'number' },
              },
              required: ['calories', 'proteinG', 'carbsG', 'fatG'],
            },
            boundingBox: {
              type: 'object',
              description: 'Approximate location of this item in the image, as percentages (0-100) of image width/height, from the top-left corner.',
              properties: {
                xPct: { type: 'number' },
                yPct: { type: 'number' },
                wPct: { type: 'number' },
                hPct: { type: 'number' },
              },
            },
          },
          required: [
            'seenDescription',
            'bestGuessName',
            'identificationConfidence',
            'estimatedGramsMin',
            'estimatedGramsMax',
            'per100gEstimate',
          ],
        },
      },
    },
    required: ['isFood', 'items'],
  },
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
Call the report_food_analysis tool with your findings. Do not respond with plain text.`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let body: { image?: string };
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

    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'Server not configured: missing ANTHROPIC_API_KEY secret' }, 500);
    }

    try {
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: env.ANTHROPIC_MODEL || 'claude-sonnet-5',
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          tools: [ANALYSIS_TOOL],
          tool_choice: { type: 'tool', name: 'report_food_analysis' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
                { type: 'text', text: 'Analyze this food photo following your protocol.' },
              ],
            },
          ],
        }),
      });

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        return json({ error: `Vision API error: ${anthropicRes.status}`, detail: errText }, 502);
      }

      const data = await anthropicRes.json();
      const toolUse = (data.content ?? []).find((block: { type: string }) => block.type === 'tool_use');
      if (!toolUse) {
        return json({ error: 'Model did not return structured analysis' }, 502);
      }

      return json(toolUse.input, 200);
    } catch (err) {
      return json({ error: 'Recognition request failed', detail: String(err) }, 502);
    }
  },
};

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}
