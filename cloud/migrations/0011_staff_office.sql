-- The parts of the staff back office at /staff each staff member may use, such as "orders,pages". Only the owner changes it.
ALTER TABLE customers ADD COLUMN permissions TEXT NOT NULL DEFAULT '';

-- Staff could already change orders and table records through the API, so they keep those two areas.
UPDATE customers SET permissions = 'orders,data' WHERE role = 'staff';

-- Who changed each order's status and when, so the owner can see what staff did.
CREATE TABLE order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  actor TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  -- The staff member's name and email at the time, kept even if their account is deleted later.
  actor_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX order_events_by_order ON order_events (order_id, id);

-- Only a hash of an order's private link is kept, so a status email can't repeat it. Each email gets a new link that opens the same order.
CREATE TABLE order_links (
  token_hash TEXT PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX order_links_by_order ON order_links (order_id);
