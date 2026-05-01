// Developed by Himanshu Kashyap
// GET /api/admin/crashes
//   List grouped crashes (paginated, sorted by occurrences or last_seen).
//   Query: ?page=1&limit=50&sort=occurrences|last_seen|first_seen&order=desc&search=
//
// GET /api/admin/crashes?hash=<group_hash>
//   Detail of one crash group + recent raw occurrences.
//
// Requires: Authorization: Bearer <ADMIN_PASSWORD>

const { connectToDatabase } = require('../../lib/db');
const { requireAdmin }      = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAdmin(req, res))  return;
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  const { hash } = req.query;

  try {
    const { db } = await connectToDatabase();

    if (hash) return getGroupDetail(db, hash, res);
    return listGroups(db, req.query, res);

  } catch (err) {
    console.error('admin/crashes error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

async function listGroups(db, query, res) {
  const {
    page   = '1',
    limit  = '50',
    sort   = 'last_seen',
    order  = 'desc',
    search = '',
  } = query;

  const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
  const limitNum = Math.min(100, parseInt(limit, 10) || 50);
  const skip     = (pageNum - 1) * limitNum;

  const allowedSort = ['occurrences', 'last_seen', 'first_seen'];
  const sortField = allowedSort.includes(sort) ? sort : 'last_seen';
  const sortDir   = order === 'asc' ? 1 : -1;

  const filter = {};
  if (search.trim()) {
    filter['sample.message'] = { $regex: search.trim(), $options: 'i' };
  }

  const [groups, total] = await Promise.all([
    db.collection('crash_groups')
      .find(filter, { projection: { _id: 0 } })
      .sort({ [sortField]: sortDir })
      .skip(skip)
      .limit(limitNum)
      .toArray(),
    db.collection('crash_groups').countDocuments(filter),
  ]);

  // Compute affected_devices per group in a single aggregate (one round-trip),
  // not N — querying per row would tank the page on hundreds of groups.
  const hashes = groups.map(g => g.group_hash);
  const deviceCounts = hashes.length === 0 ? [] : await db.collection('crashes').aggregate([
    { $match: { group_hash: { $in: hashes } } },
    { $group: { _id: '$group_hash', devices: { $addToSet: '$device_id' } } },
    { $project: { _id: 1, count: { $size: '$devices' } } },
  ]).toArray();

  const countByHash = Object.fromEntries(deviceCounts.map(d => [d._id, d.count]));
  const enriched = groups.map(g => ({
    ...g,
    affected_devices: countByHash[g.group_hash] || 0,
  }));

  // Trim sample.stack_trace in list view — full trace only sent on detail click
  for (const g of enriched) {
    if (g.sample?.stack_trace) {
      g.sample.stack_trace_preview = g.sample.stack_trace.slice(0, 200);
      delete g.sample.stack_trace;
    }
  }

  return res.status(200).json({
    groups: enriched,
    pagination: {
      page:        pageNum,
      limit:       limitNum,
      total,
      total_pages: Math.ceil(total / limitNum),
    },
  });
}

async function getGroupDetail(db, hash, res) {
  const [group, recent, deviceCount] = await Promise.all([
    db.collection('crash_groups').findOne({ group_hash: hash }, { projection: { _id: 0 } }),
    db.collection('crashes')
      .find({ group_hash: hash }, { projection: { _id: 0 } })
      .sort({ received_at: -1 })
      .limit(20)
      .toArray(),
    db.collection('crashes').aggregate([
      { $match: { group_hash: hash } },
      { $group: { _id: null, devices: { $addToSet: '$device_id' } } },
      { $project: { _id: 0, count: { $size: '$devices' } } },
    ]).toArray(),
  ]);

  if (!group) return res.status(404).json({ error: 'Group not found' });

  return res.status(200).json({
    group: { ...group, affected_devices: deviceCount[0]?.count || 0 },
    recent_occurrences: recent,
  });
}
