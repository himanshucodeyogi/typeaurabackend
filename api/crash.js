// Developed by Himanshu Kashyap
// POST /api/crash
// Receives batched crash reports from the TypeAura Android app.
// Body: { crashes: [{ device_id, app_version, mode, error_type, message,
//                     stack_trace, fatal, timestamp, group_hash }] }

const { connectToDatabase } = require('../lib/db');

const MAX_BATCH       = 50;
const MAX_STACK_BYTES = 8 * 1024; // hard server-side cap, mirrors client truncation

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { crashes } = req.body || {};

  if (!Array.isArray(crashes) || crashes.length === 0) {
    return res.status(400).json({ error: 'crashes array required' });
  }

  if (crashes.length > MAX_BATCH) {
    return res.status(413).json({ error: `Batch too large; max ${MAX_BATCH}` });
  }

  try {
    const { db } = await connectToDatabase();

    const safe = crashes.map(c => ({
      device_id:    c.device_id    || 'unknown',
      app_version:  c.app_version  || 'unknown',
      mode:         c.mode         || 'unknown',     // "keyboard" or "app"
      error_type:   c.error_type   || 'unknown',     // "flutter_error" | "platform_error" | "zone_error" | "manual"
      message:      truncate(c.message    || '',  500),
      stack_trace:  truncate(c.stack_trace || '', MAX_STACK_BYTES),
      fatal:        Boolean(c.fatal),
      timestamp:    c.timestamp    || new Date().toISOString(),
      group_hash:   c.group_hash   || 'no_hash',
      received_at:  new Date(),
    }));

    await db.collection('crashes').insertMany(safe, { ordered: false });

    // Maintain a per-group counter for dedup-style aggregation in the admin UI later.
    // One bulk update per unique group_hash in this batch.
    const groupCounts = {};
    for (const c of safe) {
      groupCounts[c.group_hash] = (groupCounts[c.group_hash] || 0) + 1;
    }
    const ops = Object.entries(groupCounts).map(([hash, count]) => ({
      updateOne: {
        filter: { group_hash: hash },
        update: {
          $inc: { occurrences: count },
          $set: { last_seen: new Date() },
          $setOnInsert: {
            group_hash:  hash,
            first_seen:  new Date(),
            sample: {
              message:     safe.find(s => s.group_hash === hash).message,
              stack_trace: safe.find(s => s.group_hash === hash).stack_trace,
              error_type:  safe.find(s => s.group_hash === hash).error_type,
            },
          },
        },
        upsert: true,
      },
    }));
    if (ops.length > 0) {
      await db.collection('crash_groups').bulkWrite(ops, { ordered: false });
    }

    return res.status(200).json({ ok: true, crashes_received: safe.length });

  } catch (err) {
    console.error('crash error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

function truncate(s, max) {
  if (typeof s !== 'string') return '';
  return s.length > max ? s.substring(0, max) : s;
}
