-- Approvals: a table's records can need one or more people to approve them, such as an expense claim.
-- Only new tables. Existing tables and records are not changed, and a table without a flow works exactly as before.

-- The steps a record of one table goes through. One flow per table. The rule is JSON, checked by approvals.ts.
CREATE TABLE approval_flows (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  table_id INTEGER NOT NULL UNIQUE REFERENCES data_tables(id) ON DELETE CASCADE,
  rule TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Where each submitted record is now. No row means a draft. `plan` is the list of steps worked out when it was sent,
-- so changing the flow later never moves a request that is already waiting. `version` becomes a new random number on
-- every change, and every change is made only if it is still the version that was read, so two clicks can't skip a step.
CREATE TABLE approval_requests (
  id INTEGER PRIMARY KEY,
  flow_id INTEGER NOT NULL REFERENCES approval_flows(id) ON DELETE CASCADE,
  table_id INTEGER NOT NULL REFERENCES data_tables(id) ON DELETE CASCADE,
  record_id INTEGER NOT NULL UNIQUE REFERENCES data_records(id) ON DELETE CASCADE,
  requester_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'returned')),
  step INTEGER NOT NULL DEFAULT 0,
  round INTEGER NOT NULL DEFAULT 1,
  plan TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX approval_requests_by_status ON approval_requests (status, table_id);

-- Who decided what, when, and why. Rows are only ever added: the triggers below refuse every change and deletion,
-- through the API, the back office, Claude and any other code. Names are copied, and there are no foreign keys,
-- so the history stays complete even after a record, table or account is deleted.
CREATE TABLE approval_decisions (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL,
  request_id INTEGER NOT NULL,
  table_name TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  round INTEGER NOT NULL,
  step INTEGER NOT NULL,
  step_label TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL CHECK (action IN ('submitted', 'approved', 'rejected', 'returned')),
  actor_id INTEGER,
  actor_role TEXT NOT NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX approval_decisions_by_record ON approval_decisions (record_id, id);

CREATE TRIGGER approval_decisions_never_change BEFORE UPDATE ON approval_decisions
BEGIN
  SELECT RAISE(ABORT, 'Approval history cannot be changed.');
END;

CREATE TRIGGER approval_decisions_never_deleted BEFORE DELETE ON approval_decisions
BEGIN
  SELECT RAISE(ABORT, 'Approval history cannot be deleted.');
END;
