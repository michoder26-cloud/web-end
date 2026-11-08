-- Test mode: the owner tries the site as a customer. What they make is marked as a test, has no real effects,
-- and can be removed in one step.
ALTER TABLE sites ADD COLUMN test_hash TEXT;
ALTER TABLE sites ADD COLUMN test_until TEXT;
ALTER TABLE orders ADD COLUMN test INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entries ADD COLUMN test INTEGER NOT NULL DEFAULT 0;
ALTER TABLE data_records ADD COLUMN test INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN test INTEGER NOT NULL DEFAULT 0;
