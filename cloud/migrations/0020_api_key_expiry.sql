-- New integration keys expire by default. Existing keys remain usable until their
-- owner deliberately replaces them, so this migration cannot silently break a site.
ALTER TABLE api_keys ADD COLUMN expires_at TEXT;

CREATE INDEX api_keys_expiry ON api_keys (expires_at) WHERE expires_at IS NOT NULL;
