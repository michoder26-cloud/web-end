-- Tables the owner designs through Claude or the back office, without changing the code.
CREATE TABLE data_tables (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  fields TEXT NOT NULL,
  read_access TEXT NOT NULL DEFAULT 'owner',
  write_access TEXT NOT NULL DEFAULT 'owner',
  record_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (site_id, name)
);

CREATE TABLE data_records (
  id INTEGER PRIMARY KEY,
  table_id INTEGER NOT NULL REFERENCES data_tables(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX data_records_by_table ON data_records (table_id, id);
CREATE INDEX data_records_by_customer ON data_records (table_id, customer_id, id);

-- Secret keys for other systems, such as a Wix site's backend code.
CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL DEFAULT 'full',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT
);

CREATE TABLE webhooks (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT NOT NULL,
  secret TEXT NOT NULL,
  last_status INTEGER,
  last_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A published copy of the pages and settings. Data such as orders and records is never versioned.
CREATE TABLE versions (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  settings TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE version_pages (
  version_id INTEGER NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  published INTEGER NOT NULL,
  blocks TEXT NOT NULL,
  PRIMARY KEY (version_id, slug)
);

ALTER TABLE sites ADD COLUMN live_version INTEGER REFERENCES versions(id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
