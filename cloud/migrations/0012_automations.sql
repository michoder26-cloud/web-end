-- Rules the owner sets up through Claude: when something happens, do something. Stored as checked JSON, never as code.
CREATE TABLE automations (
  -- Never reused, so a new rule can't inherit an old one's hourly run count.
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  -- Signs the messages its webhook steps send, like the secret of a webhook.
  secret TEXT NOT NULL,
  runs INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX automations_by_site ON automations (site_id, enabled);

-- The last few runs of each automation, so the owner and Claude can see what happened and why.
CREATE TABLE automation_runs (
  id INTEGER PRIMARY KEY,
  automation_id INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL,
  notes TEXT NOT NULL,
  error TEXT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX automation_runs_by_automation ON automation_runs (automation_id, id);
