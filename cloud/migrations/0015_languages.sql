-- One site in more than one language. Each page and product keeps its words in other languages beside the original,
-- as JSON such as {"en": {"title": "...", "blocks": [...]}}. The menu, tagline and footer keep theirs in the site's settings.
ALTER TABLE pages ADD COLUMN translations TEXT NOT NULL DEFAULT '{}';
-- Published versions hold the translations too, so publishing and going back to a version include them.
ALTER TABLE version_pages ADD COLUMN translations TEXT NOT NULL DEFAULT '{}';
ALTER TABLE items ADD COLUMN translations TEXT NOT NULL DEFAULT '{}';
-- The language the customer ordered in, so emails about the order later come in it too. Empty means the main language.
ALTER TABLE orders ADD COLUMN language TEXT NOT NULL DEFAULT '';
