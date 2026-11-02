CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  payment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  subtotal INTEGER NOT NULL,
  shipping INTEGER NOT NULL,
  total INTEGER NOT NULL,
  money_prefix TEXT NOT NULL DEFAULT '',
  money_suffix TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX orders_by_site ON orders (site_id, id);
CREATE INDEX orders_by_customer ON orders (customer_id);

-- Each line keeps the name and price at the time of the order, so later changes to a product don't rewrite old orders.
CREATE TABLE order_lines (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id INTEGER,
  title TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL
);

CREATE INDEX order_lines_by_order ON order_lines (order_id);
