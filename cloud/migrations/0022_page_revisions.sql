-- A page can be restored on its own, without rolling back orders, products or other pages.
CREATE TABLE page_revisions (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  published INTEGER NOT NULL,
  blocks TEXT NOT NULL,
  translations TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX page_revisions_by_page ON page_revisions (site_id, slug, id DESC);
