CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (site_id, email)
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE INDEX sessions_by_customer ON sessions (customer_id);

CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE throttle (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

ALTER TABLE entries ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX entries_by_customer ON entries (customer_id);

CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  collection TEXT NOT NULL,
  title TEXT NOT NULL,
  price TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  link_label TEXT NOT NULL DEFAULT '',
  link_href TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX items_by_collection ON items (site_id, collection, sort, id);

CREATE TABLE media (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  bytes BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
