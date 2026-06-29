# LeadMiner v2

B2B email finder. Crawls a company's public pages, web-searches for published
contact emails, and does a DNS MX check. Zero npm dependencies (Node 18+).

```
leadminer-v2.html     frontend (single page)
lib/engine.js         scraping engine (shared)
api/find.js           Vercel serverless function  → /api/find
server/server.js      local dev server (same engine)
vercel.json           Vercel routing + function config
```

## Run locally

```powershell
cd "c:\Users\USER\OneDrive\Desktop\Ranjith works\lead miner"
node server/server.js
```
Open <http://localhost:8787> (open via the server, NOT the .html file directly).

## Deploy to Vercel

No Git repo required — the Vercel CLI deploys straight from this folder.

```powershell
cd "c:\Users\USER\OneDrive\Desktop\Ranjith works\lead miner"
npx vercel login          # one-time: opens browser to sign in
npx vercel                # first deploy → creates the project, gives a preview URL
npx vercel --prod         # promote to your production URL
```

Answer the prompts with the defaults (framework: **Other**, build command: **none**,
output dir: **leave blank**). `vercel.json` already wires `/` to the page and
`/api/find` to the serverless function.

### Enable Brave Search on Vercel (recommended)

DuckDuckGo scraping is often blocked from datacenter IPs, so on Vercel you should
use a Brave Search API key (free ~2,000/mo at <https://brave.com/search/api/>):

```powershell
npx vercel env add BRAVE_API_KEY     # paste your key, choose Production (+ Preview)
npx vercel --prod                    # redeploy so the new env var takes effect
```

Or set it in the Vercel dashboard → Project → Settings → Environment Variables.

## Reality check (serverless limits)

- **Datacenter IPs get blocked more.** Target sites and DuckDuckGo may refuse
  Vercel's IPs → fewer results than local. A Brave key mitigates the search half.
- **Time limits.** `maxDuration` is set to 60s; very slow sites can still time out.
- **Hobby (free) plan is for non-commercial use.** Commercial use needs Pro.
- Scrapes only public pages. Social networks (LinkedIn etc.) block bots — those
  come back empty rather than faked.
