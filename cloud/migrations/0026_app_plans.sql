-- One plain-language map of the system Claude is building. It is intentionally separate
-- from tables and pages: the owner can understand the plan before any individual part changes.
CREATE TABLE app_plans (
  site_id INTEGER PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A plan is safe to revise, but its earlier snapshots stay available for an audit or a return to a prior design.
CREATE TABLE app_plan_revisions (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  plan TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(site_id, version)
);

CREATE TRIGGER app_plan_revisions_never_change BEFORE UPDATE ON app_plan_revisions
BEGIN
  SELECT RAISE(ABORT, 'App plan history cannot be changed.');
END;
