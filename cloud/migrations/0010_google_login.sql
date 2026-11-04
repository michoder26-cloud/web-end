-- Customers who log in with Google. Google's account id (sub) never changes, unlike an email, so later logins match on it first.
ALTER TABLE customers ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX customers_by_google ON customers (site_id, google_sub);

-- Google logins that have started but not finished. Each row works once, for ten minutes, and only in the browser that started it.
CREATE TABLE google_logins (
  state_hash TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  next TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
