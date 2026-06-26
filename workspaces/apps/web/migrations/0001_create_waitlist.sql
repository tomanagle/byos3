-- Phase 0 - waitlist table. Applied with `wrangler d1 migrations apply DB [--local|--remote]`.
CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  referrer TEXT,
  created_at INTEGER NOT NULL
);
