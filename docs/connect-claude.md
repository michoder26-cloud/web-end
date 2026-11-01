# Connect Claude to your site

**Status:** tested with the official MCP client on a local copy. These steps have not yet been tried in the Claude app, because Claude needs a public address and the site can't go online yet.

## 1. Get your key

1. Open `https://your-site/admin` and log in.
2. Open **Users**, then your account.
3. Turn on **Enable API Key** and save.
4. Copy the key. Anyone who has it can change your site, so keep it private.

Only owner accounts can use the MCP server. A member's key is refused.

## 2. Add the connector

Follow Claude's guide to [custom connectors](https://claude.com/docs/connectors/custom/remote-mcp):

- **URL:** `https://your-site/api/mcp`
- **Sign-in:** No sign-in
- **Request header name:** `Authorization`
- **Request header value:** `Bearer your-key`, including the word `Bearer`

## 3. Start building

Open a new chat, turn on the connector and say:

> Help me build a website for my business.

Claude looks at your site, asks about your business a few questions at a time, then builds the pages and gives you the link.

## If you lose your key

Log in to the admin panel and generate a new key on your account. The old one stops working.
