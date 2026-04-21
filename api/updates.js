// Developed by Himanshu Kashyap
// GET /api/updates
// Returns the latest app version info and changelog.
// Update this file whenever a new version is released.

const LATEST = {
  version: '1.1.0',
  title: 'AI Playground & Analytics',
  date: '2025-04-21',
  highlights: [
    '✨ AI Playground on Home — fix, rewrite, translate without switching apps',
    '📊 Usage stats — daily AI count, streak, and total uses',
    '🔥 Streak tracking — see how many days you\'ve used AuraKeys',
    '🎨 New themes panel with live preview',
    '⚡ Faster Groq API key rotation for better uptime',
  ],
  minSupportedVersion: '1.0.0',
};

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(200).json(LATEST);
};
