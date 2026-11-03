-- What each old page contained when it was read, so a move can be checked at any time without fetching it again.
CREATE TABLE move_sources (
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  page_slug TEXT,
  reading TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (site_id, url)
);

-- The differences last shown when publishing, so they stop a publish once and are then the owner's decision.
ALTER TABLE sites ADD COLUMN move_differences_shown TEXT;

DROP TABLE move_checks;
