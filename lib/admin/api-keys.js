// Developed by Himanshu Kashyap
// GET /api/admin/api-keys
// Returns all configured Groq API keys (masked + full value) for health check.
// Requires: Authorization: Bearer <ADMIN_PASSWORD>

const { requireAdmin } = require('../auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAdmin(req, res))  return;
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  // Support both single key (GROQ_API_KEY) and comma-separated (GROQ_API_KEYS)
  const rawKeys = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);

  if (!rawKeys.length) {
    return res.status(200).json({ keys: [] });
  }

  const keys = rawKeys.map((k, i) => ({
    name:  `Key ${i + 1}`,
    key:   k,
    model: 'llama-3.3-70b-versatile',
  }));

  return res.status(200).json({ keys });
};
