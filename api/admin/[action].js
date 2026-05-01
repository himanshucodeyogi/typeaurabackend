// Developed by Himanshu Kashyap
// Single Vercel serverless function that dispatches /api/admin/<action> to a
// handler in lib/admin/. Consolidated to fit under the Hobby plan's 12-function
// cap — files in lib/ are bundled into this function and don't count separately.
//
// URL paths unchanged: /api/admin/users, /api/admin/stats, /api/admin/crashes, etc.

const handlers = {
  'users':       require('../../lib/admin/users'),
  'user':        require('../../lib/admin/user'),
  'stats':       require('../../lib/admin/stats'),
  'api-keys':    require('../../lib/admin/api-keys'),
  'check-keys':  require('../../lib/admin/check-keys'),
  'set-version': require('../../lib/admin/set-version'),
  'key-limits':  require('../../lib/admin/key-limits'),
  'crashes':     require('../../lib/admin/crashes'),
};

module.exports = async function handler(req, res) {
  // CORS preflight for unknown actions still needs to succeed
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;
  const fn = handlers[action];
  if (!fn) {
    return res.status(404).json({ error: `Unknown admin action: ${action}` });
  }

  return fn(req, res);
};
