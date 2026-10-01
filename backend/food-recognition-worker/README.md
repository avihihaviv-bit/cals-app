# Food recognition backend (not active by default)

This is a small Cloudflare Worker that does the *real* photo analysis for the
"Scan Food" feature — it sends the photo to Google's Gemini vision model and
returns a structured breakdown of what it saw vs. what it's estimating.

The app works without this deployed: it falls back to an honest "we couldn't
analyze this automatically" screen with a manual search option — it never
fabricates a fake result.

## Why Gemini?

Gemini has a genuinely free API tier — no credit card, and no connection to
a paid Gemini/Claude chat subscription (those are separate products from
their APIs). It still supports image input, which is all this needs. The
free tier has a daily request limit, which is plenty for personal use.

## Why a separate backend at all?

The app is a static site (GitHub Pages). An API key can never be shipped in
static client code — anyone could read it out of the page and run up usage
against it. This Worker holds the key server-side and is the only thing
that talks to the Gemini API; the app calls this Worker, never Gemini
directly.

## Deploy steps (no terminal needed)

1. Get a free Gemini API key at https://aistudio.google.com/apikey — sign in
   with a Google account, click **Create API key**, copy it.
2. Go to https://dash.cloudflare.com and sign up (free).
3. **Workers & Pages → Create → Create Worker**, give it a name, **Deploy**.
4. Click **Edit code**, delete the placeholder code, paste in the contents
   of `dashboard-paste-version/index.js` (plain JS — the dashboard editor
   doesn't run TypeScript), then **Save and deploy**.
5. **Settings → Variables and Secrets → Add**: name `GEMINI_API_KEY`, value
   = the key from step 1, mark it as a **Secret**. **Save and deploy**.
6. Copy the Worker's URL (shown at the top of its page), something like
   `https://cals-app-food-recognition.<your-subdomain>.workers.dev`.
7. Set that URL as `VITE_FOOD_RECOGNITION_API_URL` in the app's build
   (a GitHub Pages repository variable, passed through in the deploy
   workflow's `env:` for the build step, the same way `GITHUB_PAGES` is
   passed today), then rebuild/redeploy the site.

(If you'd rather use the CLI: `npm install`, `npx wrangler login`,
`npx wrangler secret put GEMINI_API_KEY`, `npx wrangler deploy` from this
folder — same result, using `src/index.ts`.)

## Cost

Free, as long as usage stays inside Gemini's free-tier daily request limit
— check current limits at https://ai.google.dev/gemini-api/docs/rate-limits
before relying on this for heavy use. Cloudflare Workers' own free tier
covers hosting the Worker itself.
