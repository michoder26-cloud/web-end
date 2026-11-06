-- The owner can manage the back office through a normal signed-in account,
-- without carrying the capability URL in every browser bookmark.
ALTER TABLE sites ADD COLUMN owner_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX sites_by_owner_customer ON sites(owner_customer_id);
