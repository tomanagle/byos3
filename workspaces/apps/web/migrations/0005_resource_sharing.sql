-- Resource-level sharing (rbac.md): connector.owner_user_id becomes a real FK to user, and a
-- user↔connector / user↔volume membership grants a role (full|read_write|read_only).

-- SQLite can't ALTER a column to add a constraint, so rebuild `connector` with the owner FK.
CREATE TABLE connector_new (
  id text PRIMARY KEY NOT NULL,
  owner_user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  provider text NOT NULL,
  endpoint text NOT NULL,
  region text NOT NULL,
  access_key_id text NOT NULL,
  secret_cipher text NOT NULL,
  label text NOT NULL,
  status text NOT NULL,
  created_at integer NOT NULL
);
INSERT INTO connector_new
  SELECT id, owner_user_id, provider, endpoint, region, access_key_id, secret_cipher, label, status, created_at
  FROM connector;
DROP TABLE connector;
ALTER TABLE connector_new RENAME TO connector;

CREATE TABLE connector_member (
  id text PRIMARY KEY NOT NULL,
  connector_id text NOT NULL REFERENCES connector(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at integer NOT NULL
);
CREATE UNIQUE INDEX connector_member_unique ON connector_member (connector_id, user_id);

CREATE TABLE volume_member (
  id text PRIMARY KEY NOT NULL,
  volume_id text NOT NULL REFERENCES volume(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at integer NOT NULL
);
CREATE UNIQUE INDEX volume_member_unique ON volume_member (volume_id, user_id);
