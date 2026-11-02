ALTER TABLE items ADD COLUMN category TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN compare_price TEXT NOT NULL DEFAULT '';
-- Empty stock means unlimited. The check makes an order fail rather than oversell.
ALTER TABLE items ADD COLUMN stock INTEGER CHECK (stock IS NULL OR stock >= 0);

CREATE TABLE item_variants (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price TEXT NOT NULL DEFAULT '',
  compare_price TEXT NOT NULL DEFAULT '',
  stock INTEGER CHECK (stock IS NULL OR stock >= 0),
  sort INTEGER NOT NULL DEFAULT 0,
  UNIQUE (item_id, name)
);

ALTER TABLE order_lines ADD COLUMN variant_id INTEGER;
ALTER TABLE order_lines ADD COLUMN variant TEXT NOT NULL DEFAULT '';
