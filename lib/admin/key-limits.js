// Developed by Himanshu Kashyap
// GET  /api/admin/key-limits  — rate-limit block status for all configured Groq keys
// DELETE /api/admin/key-limits — manually unblock a key { key_hash }

const crypto                = require('crypto');
const { connectToDatabase } = require('../db');
const { requireAdmin }      = require('../auth');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.3-70b-versatile';

function keyHash(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

async function checkKeyValidity(key) {
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 1 }),
    });
    if (res.ok || res.status === 429) return 'valid';
    if (res.status === 401) return 'invalid';
    return 'valid';
  } catch {
    return 'valid';
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAdmin(req, res)) return;

  const rawKeys = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '')
    .split(',').map(k => k.trim()).filter(Boolean);

  try {
    const { db } = await connectToDatabase();

    if (req.method === 'GET') {
      const [blocks, validityResults] = await Promise.all([
        db.collection('groq_key_blocks')
          .find({}, { projection: { key_hash: 1, blocked_until: 1 } })
          .toArray(),
        Promise.all(rawKeys.map(checkKeyValidity)),
      ]);

      const blockMap = new Map(blocks.map(b => [b.key_hash, b.blocked_until]));
      const now      = new Date();

      const keys = rawKeys.map((k, i) => {
        const hash         = keyHash(k);
        const blockedUntil = blockMap.get(hash);
        const isBlocked    = !!blockedUntil && new Date(blockedUntil) > now;
        const isInvalid    = validityResults[i] === 'invalid';

        let status;
        if (isBlocked)       status = 'blocked';
        else if (isInvalid)  status = 'invalid';
        else                 status = 'available';

        return {
          index:         i + 1,
          name:          `Key ${i + 1}`,
          masked:        k.slice(0, 7) + '••••••••••••' + k.slice(-4),
          key_hash:      hash,
          status,
          blocked_until: isBlocked ? blockedUntil : null,
        };
      });

      return res.status(200).json({ keys });
    }

    if (req.method === 'DELETE') {
      const { key_hash } = req.body || {};
      if (!key_hash) return res.status(400).json({ error: 'key_hash required' });

      await db.collection('groq_key_blocks').deleteOne({ key_hash });
      return res.status(200).json({ ok: true, unblocked: key_hash });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('key-limits error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
