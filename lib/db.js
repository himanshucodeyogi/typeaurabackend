// Developed by Himanshu Kashyap
// MongoDB connection with serverless-safe caching
// (Vercel keeps the function warm, so the same connection is reused)

const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI environment variable is not set');

// Cache the promise itself so concurrent callers share one connection attempt
// instead of each opening their own TCP/TLS handshake to MongoDB Atlas.
let _connectionPromise = null;

async function connectToDatabase() {
  if (_connectionPromise) return _connectionPromise;

  _connectionPromise = (async () => {
    const client = new MongoClient(uri, {
      maxPoolSize: 1,          // keep pool small for serverless
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    const db = client.db('typeaura');
    await _ensureIndexes(db);
    return { client, db };
  })();

  // On failure, clear the cached promise so the next request retries
  _connectionPromise.catch(() => { _connectionPromise = null; });

  return _connectionPromise;
}

async function _ensureIndexes(db) {
  try {
    await Promise.all([
      // devices — unique key
      db.collection('devices').createIndex({ device_id: 1 }, { unique: true }),
      // devices — sort fields used by admin/users
      db.collection('devices').createIndex({ last_use_date: -1 }),
      db.collection('devices').createIndex({ install_date: -1 }),
      db.collection('devices').createIndex({ total_ai_uses: -1 }),
      db.collection('devices').createIndex({ total_keyboard_opens: -1 }),
      db.collection('devices').createIndex({ total_app_opens: -1 }),
      // devices — filter fields used by admin/users
      db.collection('devices').createIndex({ keyboard_enabled: 1 }),
      db.collection('devices').createIndex({ keyboard_selected: 1 }),
      // devices — text search on device_name
      db.collection('devices').createIndex({ device_name: 1 }),
      // events
      db.collection('events').createIndex({ device_id: 1 }),
      db.collection('events').createIndex({ event_type: 1 }),
      db.collection('events').createIndex({ timestamp: -1 }),
      // events — device detail modal (device_id + sort by timestamp)
      db.collection('events').createIndex({ device_id: 1, timestamp: -1 }),
      // groq_key_blocks — TTL: auto-delete when blocked_until expires
      db.collection('groq_key_blocks').createIndex({ blocked_until: 1 }, { expireAfterSeconds: 0 }),
      db.collection('groq_key_blocks').createIndex({ key_hash: 1 }, { unique: true }),
      // crashes — individual crash events, queried by device & time
      db.collection('crashes').createIndex({ device_id: 1, received_at: -1 }),
      db.collection('crashes').createIndex({ received_at: -1 }),
      db.collection('crashes').createIndex({ group_hash: 1 }),
      // crash_groups — deduplicated by group_hash, ordered by recency for "top crashes"
      db.collection('crash_groups').createIndex({ group_hash: 1 }, { unique: true }),
      db.collection('crash_groups').createIndex({ occurrences: -1 }),
      db.collection('crash_groups').createIndex({ last_seen: -1 }),
    ]);
  } catch (_) {
    // Indexes already exist — safe to ignore
  }
}

module.exports = { connectToDatabase };
