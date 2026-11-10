-- Keep draft privacy outside owner-editable settings and site content backups.
CREATE TABLE IF NOT EXISTS starter_privacy (
  site_id INTEGER PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE
);
-- Preserve the earlier settings-based flag, if any installation used it.
INSERT OR IGNORE INTO starter_privacy (site_id)
SELECT id FROM sites WHERE json_valid(settings) AND json_extract(settings, '$.draftStarter') = 1;
