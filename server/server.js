// LeadMiner local dev server — serves the frontend AND exposes /api/find.
// The actual scraping logic lives in ../lib/engine.js (shared with the Vercel
// serverless function in api/find.js), so local and production behave identically.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { findLeads, hasBraveKey } = require('../lib/engine');

const PORT = process.env.PORT || 8787;
const FRONTEND = path.join(__dirname, '..', 'leadminer-v2.html');

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if (u.pathname === '/api/find') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const company = (u.searchParams.get('company') || '').trim();
    const name = (u.searchParams.get('name') || '').trim();
    const domain = (u.searchParams.get('domain') || '').trim();
    if (!company && !domain) { res.writeHead(400); res.end(JSON.stringify({ error: 'company or domain is required' })); return; }
    try {
      const data = await findLeads({ company, name, domain });
      res.writeHead(200); res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500); res.end(JSON.stringify({ error: String((err && err.message) || err) }));
    }
    return;
  }

  if (u.pathname === '/' || u.pathname === '/leadminer-v2.html') {
    fs.readFile(FRONTEND, (e, buf) => {
      if (e) { res.writeHead(404); res.end('frontend not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buf);
    });
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => {
  console.log(`\n  LeadMiner running →  http://localhost:${PORT}`);
  console.log('  Search: ' + (hasBraveKey() ? 'Brave Search API ✓ (DuckDuckGo fallback)' : 'DuckDuckGo scraping (set BRAVE_API_KEY to use Brave)'));
  console.log('  Open that URL in your browser. Ctrl+C to stop.\n');
});
