-- Old addresses from a site that moved here, so links and search results keep working.
CREATE TABLE redirects (
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  from_path TEXT NOT NULL,
  to_path TEXT NOT NULL,
  PRIMARY KEY (site_id, from_path)
);
