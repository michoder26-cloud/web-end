ALTER TABLE projects ADD COLUMN warned_at INTEGER;
ALTER TABLE projects ADD COLUMN deletion_started_at INTEGER;
CREATE INDEX projects_retention ON projects(last_active_at, warned_at, deletion_started_at);
