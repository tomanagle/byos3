-- Phase 1 — connectors (encrypted provider credentials) + volumes (mountable drives).
CREATE TABLE IF NOT EXISTS connector (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  region TEXT NOT NULL,
  access_key_id TEXT NOT NULL,
  secret_cipher TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS volume (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  namespace_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  prefix TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS volume_namespace_idx ON volume (namespace_id);
CREATE INDEX IF NOT EXISTS connector_owner_idx ON connector (owner_user_id);
