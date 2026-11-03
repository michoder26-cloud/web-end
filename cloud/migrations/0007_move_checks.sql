-- Where a copied photo came from, so a move can be checked and nothing is stored twice.
ALTER TABLE media ADD COLUMN source TEXT;
CREATE INDEX media_by_source ON media (site_id, source);

-- The latest comparison of each rebuilt page against its old page, kept for the owner to read.
CREATE TABLE move_checks (
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_slug TEXT NOT NULL,
  old_url TEXT NOT NULL,
  problems INTEGER NOT NULL,
  report TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (site_id, page_slug)
);
