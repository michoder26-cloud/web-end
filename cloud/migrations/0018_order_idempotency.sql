-- A retry with the same client key returns the original order instead of reserving stock again.
ALTER TABLE orders ADD COLUMN idempotency_key TEXT;
ALTER TABLE orders ADD COLUMN idempotency_hash TEXT;
CREATE UNIQUE INDEX orders_idempotency_key ON orders (site_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
