// Vercel serverless function → GET /api/find?company=&name=&domain=
// Same logic as the local server, but in Vercel's (req, res) handler form.
const { findLeads } = require('../lib/engine');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const q = req.query || {};
  const company = String(q.company || '').trim();
  const name = String(q.name || '').trim();
  const domain = String(q.domain || '').trim();

  if (!company) {
    res.status(400).json({ error: 'company is required' });
    return;
  }
  try {
    const data = await findLeads({ company, name, domain });
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
