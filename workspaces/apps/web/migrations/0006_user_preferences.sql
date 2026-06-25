-- Per-user UI preferences (web-app.md): one row per user, persisted server-side so a user's chosen
-- file layout (grid/list/tree + grid icon size) follows them across devices. Cached in localStorage
-- on the client for instant, flicker-free first paint.
CREATE TABLE user_preferences (
  user_id text PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  file_view text NOT NULL DEFAULT 'list',
  grid_size text NOT NULL DEFAULT 'large',
  updated_at integer NOT NULL
);
