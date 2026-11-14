-- When the owner confirmed they may copy the site, and when they confirmed they may publish it.
ALTER TABLE projects ADD COLUMN rights_confirmed_at INTEGER;
ALTER TABLE projects ADD COLUMN publish_confirmed_at INTEGER;
