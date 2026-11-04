-- Scheduled automations: when each one next runs, in UTC. Empty for rules that wait for something to happen.
ALTER TABLE automations ADD COLUMN next_run_at TEXT;

CREATE INDEX automations_due ON automations (site_id, enabled, next_run_at);

-- What date reminders have already handled: one row per rule, record and date. Claimed before acting,
-- so a rerun or two overlapping runs of the schedule never act on the same record and date twice.
CREATE TABLE automation_done (
  automation_id INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  record_id INTEGER NOT NULL,
  date_value TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (automation_id, record_id, date_value)
);

CREATE INDEX automation_done_by_age ON automation_done (at);
