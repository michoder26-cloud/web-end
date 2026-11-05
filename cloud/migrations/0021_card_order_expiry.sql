-- A hosted card checkout reserves stock. Index only reservations that can expire.
CREATE INDEX orders_expiring_card_holds ON orders (created_at, id) WHERE payment = 'card' AND status = 'pending';
