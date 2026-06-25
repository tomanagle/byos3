-- Better Auth admin plugin: platform role + ban fields on user, impersonation on session.
ALTER TABLE user ADD COLUMN role text;
ALTER TABLE user ADD COLUMN banned integer;
ALTER TABLE user ADD COLUMN ban_reason text;
ALTER TABLE user ADD COLUMN ban_expires integer;
ALTER TABLE session ADD COLUMN impersonated_by text;

-- Better Auth apiKey plugin. `key` is the hashed secret; `permissions` is JSON Record<resource,actions[]>
-- and becomes the request's keyScopes (see agents/docs/api.md, rbac.md).
CREATE TABLE apikey (
  id text PRIMARY KEY NOT NULL,
  config_id text NOT NULL DEFAULT 'default',
  name text,
  start text,
  prefix text,
  key text NOT NULL,
  reference_id text NOT NULL,
  refill_interval integer,
  refill_amount integer,
  last_refill_at integer,
  enabled integer DEFAULT 1,
  rate_limit_enabled integer DEFAULT 1,
  rate_limit_time_window integer,
  rate_limit_max integer,
  request_count integer DEFAULT 0,
  remaining integer,
  last_request integer,
  expires_at integer,
  created_at integer NOT NULL,
  updated_at integer NOT NULL,
  permissions text,
  metadata text
);
