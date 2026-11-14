-- Files of a site copied from another platform (styles, fonts, pictures, scripts),
-- served at /copied/<path>. The pages themselves are ordinary pages with one
-- "copied" block, so publishing, versions and page history work as usual.
CREATE TABLE copied_assets (
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  type TEXT NOT NULL,
  bytes BLOB NOT NULL,
  PRIMARY KEY (site_id, path)
);
