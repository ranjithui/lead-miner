// LeadMiner engine — shared by the local server (server/server.js) and the
// Vercel serverless function (api/find.js). Zero dependencies (Node >=18).
//
// Does REAL work: resolve domain → crawl public pages for emails → web search
// for articles/social → DNS MX check → labelled pattern guesses as fallback.

const dns = require('dns').promises;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const FETCH_TIMEOUT = 8000;
const BRAVE_KEY = process.env.BRAVE_API_KEY || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const IMG_TLDS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js']);
const JUNK = ['example.com', 'sentry.io', 'wixpress.com', 'yourdomain', 'yourcompany',
  'domain.com', 'email.com', 'company.com', 'name@', 'user@', 'email@', '@2x', '@3x'];
const COMMON_PAGES = ['', 'contact', 'contact-us', 'contactus', 'about', 'about-us',
  'team', 'our-team', 'company', 'support', 'connect'];

async function getText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !/text|html|json|xml/i.test(ct)) return null;
    const buf = await res.text();
    return { url: res.url, body: buf.slice(0, 600000) };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function cleanEmails(text) {
  const out = new Set();
  const matches = text.match(EMAIL_RE) || [];
  for (let raw of matches) {
    const e = raw.toLowerCase().replace(/\.$/, '');
    const tld = e.split('.').pop();
    if (IMG_TLDS.has(tld)) continue;
    if (e.length > 60 || e.length < 6) continue;
    if (JUNK.some(j => e.includes(j))) continue;
    out.add(e);
  }
  return [...out];
}

function mailtoEmails(html) {
  const out = new Set();
  const re = /mailto:([^"'?>\s]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    const e = decodeURIComponent(m[1]).toLowerCase();
    if (EMAIL_RE.test(e)) out.add(e);
    EMAIL_RE.lastIndex = 0;
  }
  return [...out];
}

// ── Brave Search API (free tier: ~2k/mo, 1 req/sec) ────────────────────
let braveChain = Promise.resolve();
function braveSearch(query) {
  const run = braveChain.then(() => braveFetch(query));
  braveChain = run.then(() => sleep(1100), () => sleep(1100));
  return run;
}
async function braveFetch(query) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch('https://api.search.brave.com/res/v1/web/search?count=10&q=' + encodeURIComponent(query), {
      signal: ctrl.signal,
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_KEY },
    });
    if (!res.ok) return [];
    const j = await res.json();
    const results = (j.web && j.web.results) || [];
    return results.map(r => r.url).filter(u => u && u.startsWith('http'));
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

async function webSearch(query) {
  if (BRAVE_KEY) {
    const r = await braveSearch(query);
    if (r.length) return r;
  }
  return ddgSearch(query);
}

async function ddgSearch(query) {
  const r = await getText('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query));
  if (!r) return [];
  const urls = [];
  const re = /uddg=([^&"']+)/g;
  let m;
  while ((m = re.exec(r.body)) && urls.length < 12) {
    try {
      const u = decodeURIComponent(m[1]);
      if (u.startsWith('http') && !u.includes('duckduckgo.com')) urls.push(u);
    } catch { /* skip bad encoding */ }
  }
  return [...new Set(urls)];
}

function hostFromUrl(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

async function resolveDomain(company, providedDomain) {
  if (providedDomain && providedDomain.includes('.')) {
    return providedDomain.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  }
  if (company.includes('.') && !company.includes(' ')) {
    return company.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  }
  const results = await webSearch(company + ' official website');
  const social = /linkedin|facebook|twitter|x\.com|instagram|youtube|wikipedia|crunchbase|glassdoor|indeed|zoominfo/i;
  for (const u of results) {
    const h = hostFromUrl(u);
    if (h && !social.test(h)) return h;
  }
  const slug = company.toLowerCase()
    .replace(/\b(pvt|ltd|inc|corp|llp|private|limited|technologies|tech|solutions|services|group|india|global|enterprises|consulting|systems)\b/g, '')
    .replace(/[^a-z0-9]/g, '').trim();
  return slug ? slug + '.com' : null;
}

async function checkMX(domain) {
  try {
    const mx = await dns.resolveMx(domain);
    return mx && mx.length ? mx.sort((a, b) => a.priority - b.priority).map(r => r.exchange) : [];
  } catch {
    return [];
  }
}

function patternGuesses(name, domain, mxValid) {
  const parts = name.trim().toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  const [f, l] = parts;
  const guesses = [];
  if (f && l) {
    const fmts = [
      [`${f}.${l}@${domain}`, 'first.last', 92],
      [`${f[0]}${l}@${domain}`, 'flast', 85],
      [`${f}@${domain}`, 'first', 78],
      [`${f[0]}.${l}@${domain}`, 'f.last', 74],
      [`${f}${l}@${domain}`, 'firstlast', 66],
    ];
    for (const [email, label, w] of fmts) {
      guesses.push({ email, label, confidence: mxValid ? w : Math.round(w * 0.55), source: 'pattern' });
    }
  }
  return guesses;
}

async function findLeads({ company, name, domain }) {
  const notes = [];
  const resolved = await resolveDomain(company, domain);
  if (!resolved) return { domain: null, mx: [], mxValid: false, emails: [], sources: [], notes: ['Could not resolve a domain for this company.'] };

  const mx = await checkMX(resolved);
  const mxValid = mx.length > 0;
  if (!mxValid) notes.push('No MX records — domain may not receive email (or resolution was wrong).');

  // 1. crawl the company's own pages
  const found = new Map();
  const sources = [];
  const pageResults = await Promise.all(
    COMMON_PAGES.map(async (p) => {
      for (const scheme of ['https://', 'http://']) {
        const r = await getText(scheme + resolved + (p ? '/' + p : ''));
        if (r) return r;
      }
      return null;
    })
  );
  for (const r of pageResults) {
    if (!r) continue;
    const emails = [...new Set([...mailtoEmails(r.body), ...cleanEmails(r.body)])];
    if (emails.length) sources.push({ type: 'website', url: r.url, count: emails.length });
    for (const e of emails) {
      if (!found.has(e)) found.set(e, { sourceUrl: r.url, where: 'website' });
    }
  }

  // 2. web search for articles / social mentioning the company
  let webUrls = [];
  try {
    const [a, b] = await Promise.all([
      webSearch(`"${company}" email contact`),
      webSearch(`${company} press OR media contact`),
    ]);
    webUrls = [...new Set([...a, ...b])].slice(0, 6);
  } catch { /* search may rate-limit */ }

  const webPages = await Promise.all(webUrls.map(getText));
  for (let i = 0; i < webPages.length; i++) {
    const r = webPages[i];
    if (!r) continue;
    const emails = cleanEmails(r.body).filter(e => e.endsWith('@' + resolved));
    if (emails.length) sources.push({ type: 'web', url: webUrls[i], count: emails.length });
    for (const e of emails) if (!found.has(e)) found.set(e, { sourceUrl: webUrls[i], where: 'web' });
  }
  for (const u of webUrls) {
    const h = hostFromUrl(u);
    if (/linkedin|facebook|twitter|x\.com|instagram|youtube/i.test(h)) {
      sources.push({ type: 'social', url: u, count: 0 });
    }
  }

  // assemble
  const emails = [];
  for (const [e, meta] of found) {
    const isRole = /^(info|contact|hello|sales|support|admin|press|media|hr|careers|enquiry|enquiries)@/.test(e);
    emails.push({
      email: e, label: 'found on ' + meta.where, confidence: 96,
      type: isRole ? 'role' : 'person', domain: resolved,
      sourceCompany: company, source: meta.where, sourceUrl: meta.sourceUrl, real: true,
    });
  }
  if (name && name.trim()) {
    for (const g of patternGuesses(name, resolved, mxValid)) {
      if (found.has(g.email)) continue;
      emails.push({ ...g, type: 'person', domain: resolved, sourceCompany: company, sourceUrl: null, real: false });
    }
  }
  if (!found.size) notes.push('No published emails found on their site or in search results.');

  const seenSrc = new Set();
  const uniqSources = sources.filter(s => (seenSrc.has(s.url) ? false : seenSrc.add(s.url)));

  return { domain: resolved, mx, mxValid, emails, sources: uniqSources, notes };
}

module.exports = { findLeads, hasBraveKey: () => !!BRAVE_KEY };
