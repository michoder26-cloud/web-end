-- News by email: people who agreed to get it, and the news the owner sends them.

-- One row per address. Nobody is added without agreeing: a box they ticked at sign-up or checkout, a newsletter form they sent,
-- or an import the owner confirmed. When and how they agreed is kept, so the owner can show it.
CREATE TABLE subscribers (
  -- Never reused, so a signed link for a removed person can't open someone else's subscription.
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  -- The same address always gives the same hash, so a campaign never reaches one address twice.
  email_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  -- pending: asked, waiting for them to confirm by email. subscribed: confirmed. unsubscribed: left, and gets nothing.
  status TEXT NOT NULL CHECK (status IN ('pending', 'subscribed', 'unsubscribed')),
  source TEXT NOT NULL CHECK (source IN ('signup', 'checkout', 'form', 'import')),
  -- Which form, or the owner's note on how imported people agreed.
  source_detail TEXT NOT NULL DEFAULT '',
  consented_at TEXT NOT NULL,
  confirmed_at TEXT,
  confirm_sent_at TEXT,
  unsubscribed_at TEXT,
  -- The site's address when they signed up, for links in a confirmation email sent later.
  origin TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (site_id, email)
);

CREATE INDEX subscribers_by_status ON subscribers (site_id, status, confirmed_at);
CREATE INDEX subscribers_waiting ON subscribers (site_id, status, confirm_sent_at);

CREATE TABLE campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  button_label TEXT NOT NULL DEFAULT '',
  button_href TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'stopped')),
  -- The site's address when sending started, for the links in each email.
  origin TEXT NOT NULL DEFAULT '',
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX campaigns_by_site ON campaigns (site_id, status);

-- Who each campaign went to. A row is claimed before the email goes, so two overlapping runs can never send it twice.
-- Only a hash of the address is kept, so removing a person removes their address everywhere.
CREATE TABLE campaign_recipients (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  email_hash TEXT NOT NULL,
  subscriber_id INTEGER,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
  error TEXT,
  at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, email_hash)
);

-- How many news emails went out each day (UTC), so sending stays inside the owner's daily limit at Resend.
CREATE TABLE news_daily (
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day)
);

-- Signs the confirm and unsubscribe links. Made the first time it is needed.
ALTER TABLE sites ADD COLUMN news_secret TEXT;
