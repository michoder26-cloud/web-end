CREATE TABLE apps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  checked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, url)
);
CREATE INDEX apps_user ON apps(user_id, updated_at);
