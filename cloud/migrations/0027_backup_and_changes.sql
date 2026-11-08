-- A restore runs over many requests. This short-lived token lets its later parts through after the accounts are replaced.
ALTER TABLE sites ADD COLUMN restore_hash TEXT;
ALTER TABLE sites ADD COLUMN restore_until TEXT;

-- What changed, by whom, and how to undo it. Only the newest 500 are kept.
CREATE TABLE change_log (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  undo TEXT,
  undone_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX change_log_by_site ON change_log (site_id, id DESC);
CREATE INDEX change_log_by_target ON change_log (site_id, actor, target, created_at);
