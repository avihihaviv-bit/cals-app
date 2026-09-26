# Food recognition backend (not active by default)

This is a small Cloudflare Worker that does the *real* photo analysis for the
"Scan Food" feature — it sends the photo to a vision-capable Claude model and
returns a structured breakdown of what it saw vs. what it's estimating.

The app works without this deployed: it falls back to an honest "we couldn't
analyze this automatically" screen with a manual search option — it never
fabricates a fake result. Deploy this only when you're ready to pay per-scan
API costs.

## Why a separate backend at all?

The app is a static site (GitHub Pages). An API key can never be shipped in
static client code — anyone could read it out of the page and run up your
bill. This Worker holds the key server-side and is the only thing that talks
to the Anthropic API; the app calls this Worker, never Anthropic directly.

## Deploy steps

1. Get an Anthropic API key: https://console.anthropic.com/settings/keys
2. Install Wrangler (Cloudflare's CLI) if you don't have it: `npm install -g wrangler`
3. From this folder:
   ```
   npm install
   npx wrangler login
   npx wrangler secret put ANTHROPIC_API_KEY
   # paste your key when prompted
   npx wrangler deploy
   ```
4. Wrangler prints a URL like `https://cals-app-food-recognition.<your-subdomain>.workers.dev`
5. In the app's build environment, set:
   ```
   VITE_FOOD_RECOGNITION_API_URL=https://cals-app-food-recognition.<your-subdomain>.workers.dev
   ```
   (for GitHub Pages: add it as a repository variable/secret and pass it
   through in the deploy workflow's `env:` for the build step, the same way
   `GITHUB_PAGES` is passed today)
6. Rebuild and redeploy the app. Photo scanning now calls this Worker for
   real analysis instead of showing the "couldn't analyze" fallback.

## Cost

Cloudflare Workers' free tier covers this Worker itself. The real cost is the
Anthropic API call per photo scan (a vision request with tool use) — check
current per-token pricing at https://www.anthropic.com/pricing before
enabling this in production, and consider adding your own rate limiting in
`src/index.ts` if usage needs to be capped.
