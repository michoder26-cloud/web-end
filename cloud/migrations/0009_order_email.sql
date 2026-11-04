-- An optional email on each order, so the customer can get a confirmation and the owner can reply.
ALTER TABLE orders ADD COLUMN email TEXT NOT NULL DEFAULT '';
