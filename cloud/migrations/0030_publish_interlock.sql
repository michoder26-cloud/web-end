ALTER TABLE sites ADD COLUMN restore_generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE versions ADD COLUMN publish_token TEXT;
CREATE UNIQUE INDEX versions_publish_token ON versions(publish_token);
