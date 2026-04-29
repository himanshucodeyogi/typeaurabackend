// Developed by Himanshu Kashyap
// POST /api/admin/set-version
// Saves the latest app version info to MongoDB.
// Body: { version, title, highlights[] }

const { connectToDatabase } = require('../../lib/db');
const { requireAdmin }      = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAdmin(req, res))  return;
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const { version, title, highlights } = req.body || {};

  if (!version || !title) {
    return res.status(400).json({ error: 'version and title are required' });
  }

  const semverRe = /^\d+\.\d+\.\d+$/;
  if (!semverRe.test(version.trim())) {
    return res.status(400).json({ error: 'version must be semver format e.g. 1.2.0' });
  }

  const cleanHighlights = Array.isArray(highlights)
    ? highlights.map(h => String(h).trim()).filter(Boolean)
    : [];

  const doc = {
    version:    version.trim(),
    title:      title.trim(),
    highlights: cleanHighlights,
    date:       new Date().toISOString().split('T')[0],
    updated_at: new Date().toISOString(),
  };

  try {
    const { db } = await connectToDatabase();
    await db.collection('config').updateOne(
      { _id: 'app_update' },
      { $set: doc },
      { upsert: true },
    );
    return res.status(200).json({ ok: true, saved: doc });
  } catch (err) {
    console.error('set-version error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
