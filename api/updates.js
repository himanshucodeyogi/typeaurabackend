// Developed by Himanshu Kashyap
// GET /api/updates
// Returns latest app version info from MongoDB (admin-managed).

const { connectToDatabase } = require('../lib/db');

const FALLBACK = {
  version:    '2.0.1',
  title:      'Performance & UI Improvements',
  date:       '2025-04-21',
  highlights: [
    '⚡ Faster keyboard response and smoother typing experience',
    '✨ Redesigned home screen with AI Playground',
    '📊 Usage stats — daily AI count, streak, and total uses',
    '🔥 Streak tracking to see how many days you\'ve used TypeAura',
    '🎨 New themes panel with live preview',
    '🐛 Bug fixes and stability improvements',
  ],
};

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { db } = await connectToDatabase();
    const doc    = await db.collection('config').findOne({ _id: 'app_update' });

    const data = doc
      ? { version: doc.version, title: doc.title, highlights: doc.highlights, date: doc.date }
      : FALLBACK;

    return res.status(200).json(data);
  } catch (err) {
    console.error('updates error:', err);
    return res.status(200).json(FALLBACK);
  }
};
