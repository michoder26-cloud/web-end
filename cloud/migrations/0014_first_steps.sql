-- The first-steps checklist on the back office overview ticks itself from these.
-- When Claude first used the site's private link.
ALTER TABLE sites ADD COLUMN claude_seen_at TEXT;
-- When the owner first opened their back office or preview on a phone.
ALTER TABLE sites ADD COLUMN phone_seen_at TEXT;

-- Sites that are already published are past their first steps, so their owners don't suddenly get a checklist.
UPDATE sites SET claude_seen_at = updated_at, phone_seen_at = updated_at WHERE live_version IS NOT NULL;
