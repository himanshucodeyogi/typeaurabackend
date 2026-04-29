// Developed by Himanshu Kashyap
// POST /api/ai
// Proxies AI requests to Groq with server-side API key rotation.
// Body: { messages: [...], temperature?: number, max_tokens?: number }

const GROQ_KEYS = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.3-70b-versatile';

let _keyIndex = 0;
function nextKey() {
  if (!GROQ_KEYS.length) return null;
  const key = GROQ_KEYS[_keyIndex % GROQ_KEYS.length];
  _keyIndex++;
  return key;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { messages, temperature = 0.7, max_tokens } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const apiKey = nextKey();
  if (!apiKey) {
    return res.status(503).json({ error: 'No API key configured' });
  }

  try {
    const body = { model: MODEL, messages, temperature };
    if (max_tokens) body.max_tokens = max_tokens;

    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await groqRes.json();

    if (!groqRes.ok) {
      console.error('Groq error:', groqRes.status, data);
      return res.status(502).json({ error: 'Groq API error', detail: data });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('ai proxy error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
