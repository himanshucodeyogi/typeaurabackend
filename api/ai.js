// Developed by Himanshu Kashyap
// POST /api/ai
// Groq API proxy with automatic key rotation.
// Rotates through GROQ_KEY_1..GROQ_KEY_N when a key hits rate limit (429).
// Body: { messages: [...], temperature?: number, max_tokens?: number }

const GROQ_KEYS = [
  process.env.GROQ_KEY_1,
  process.env.GROQ_KEY_2,
  process.env.GROQ_KEY_3,
  process.env.GROQ_KEY_4,
  process.env.GROQ_KEY_5,
  process.env.GROQ_KEY_6,
  process.env.GROQ_KEY_7,
  process.env.GROQ_KEY_8,
  process.env.GROQ_KEY_9,
  process.env.GROQ_KEY_10,
].filter(Boolean); // sirf valid keys rakhta hai

// Round-robin index — in-memory, resets on Vercel cold start (kaafi hai production ke liye)
let keyIdx = 0;

async function callGroqWithFallback(body) {
  if (GROQ_KEYS.length === 0) return null;

  const startIdx = keyIdx % GROQ_KEYS.length;

  for (let i = 0; i < GROQ_KEYS.length; i++) {
    const idx = (startIdx + i) % GROQ_KEYS.length;
    const key = GROQ_KEYS[idx];

    let res;
    try {
      res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (_) {
      // Network error — try next key
      keyIdx = (idx + 1) % GROQ_KEYS.length;
      continue;
    }

    if (res.status === 429) {
      // Ye key rate limited hai — next try karo
      keyIdx = (idx + 1) % GROQ_KEYS.length;
      continue;
    }

    // Success ya other error — return karo, next request ke liye rotate
    keyIdx = (idx + 1) % GROQ_KEYS.length;
    return res;
  }

  return null; // sab keys exhausted
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { messages, temperature = 0.7, max_tokens } = req.body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Missing or invalid messages' });
  }

  if (GROQ_KEYS.length === 0) {
    return res.status(503).json({ error: 'No API keys configured. Add GROQ_KEY_1..N to Vercel env vars.' });
  }

  const groqBody = {
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature,
    ...(max_tokens && { max_tokens }),
  };

  try {
    const groqRes = await callGroqWithFallback(groqBody);

    if (!groqRes) {
      console.error(`ai proxy: all ${GROQ_KEYS.length} keys exhausted`);
      return res.status(503).json({ error: 'service_busy', message: 'Sab AI keys busy hain. Thodi der baad try karo.' });
    }

    const data = await groqRes.json();
    return res.status(groqRes.status).json(data);

  } catch (err) {
    console.error('ai proxy error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
