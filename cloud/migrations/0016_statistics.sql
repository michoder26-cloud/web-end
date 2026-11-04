-- Visitor statistics, counted on the server without cookies, scripts or stored IP addresses. See src/stats.ts.
-- Every table is WITHOUT ROWID with no other index, so adding to a count writes exactly one row.

-- One row per day and combination of page, referring site, country and device, so a page view is one row written.
-- day is the date in the site's time zone. visitors counts people on the first page they opened that day.
-- Rows older than 400 days are deleted once a day.
CREATE TABLE stats_daily (
  day TEXT NOT NULL,
  site_id INTEGER NOT NULL,
  path TEXT NOT NULL,
  referrer TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, site_id, path, referrer, country, device)
) WITHOUT ROWID;

-- Orders placed, form entries and records visitors added, per day.
CREATE TABLE stats_events (
  day TEXT NOT NULL,
  site_id INTEGER NOT NULL,
  event TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, site_id, event)
) WITHOUT ROWID;

-- Today's visitors, as a short hash of today's random salt, the IP address and the browser, so a person counts once a day.
-- It can't be turned back into an address, and every row is deleted in the first scheduled run after the day ends.
CREATE TABLE stats_seen (
  day TEXT NOT NULL,
  site_id INTEGER NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY (day, site_id, hash)
) WITHOUT ROWID;

-- Today's random salt, replaced on the first visit of a new day, and the day old rows were last cleaned up.
CREATE TABLE stats_meta (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;
