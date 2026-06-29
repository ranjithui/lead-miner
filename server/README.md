# LeadMiner backend

Zero-dependency Node service (Node 18+). Serves the frontend and does the real
scraping: crawls a company's public pages, web-searches for published emails,
and does a DNS MX check. No paid services required.

## Run

```powershell
cd "c:\Users\USER\OneDrive\Desktop\Ranjith works\lead miner"
node server/server.js
```

Then open <http://localhost:8787/> (open it via the server, NOT the file directly,
so the page can reach the `/api/find` endpoint).

## Web search modes

The backend searches the web to find articles/social pages and the official domain.

- **Default (no setup):** scrapes DuckDuckGo's HTML endpoint. Free, no key, but can
  rate-limit and is less reliable.
- **Brave Search API (recommended):** ~2,000 queries/month free, reliable JSON.

### Enable Brave Search

1. Get a free key at <https://brave.com/search/api/> (sign up → create a key).
2. Set it as an environment variable when starting the server:

   PowerShell (this session only):
   ```powershell
   $env:BRAVE_API_KEY = "your-key-here"
   node server/server.js
   ```

   Persist it for your user account (new terminals will have it):
   ```powershell
   setx BRAVE_API_KEY "your-key-here"
   ```
   (Close and reopen the terminal after `setx`.)

On startup the server prints which search mode is active. Brave automatically
falls back to DuckDuckGo if the key is missing or the monthly quota is exhausted.

## API

`GET /api/find?company=<name-or-domain>&name=<person>&domain=<optional-domain>`

Returns JSON: `{ domain, mx, mxValid, emails[], sources[], notes[] }`.
Each email is tagged `real:true` (**Found** on a real page, with `sourceUrl`) or
`real:false` (a naming-pattern **Guess**, checked only at domain level via MX).
