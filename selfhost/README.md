# Run web-end on your own computer

This is an early Node.js + SQLite host for the same engine in `../cloud`. The site, back office, API and Studio run in one process. Data lives in one local folder. No Cloudflare, GitHub or central web-end account is needed for this mode. The Studio calls only the AI provider you configure; an API provider may charge for usage. Ollama can run locally when your computer supports the model.

Requires Node.js 22.13 or newer. On Windows, double-click [Open web-end.cmd](../Open%20web-end.cmd) in the project folder. It installs the local dependencies on first use, builds the app, and opens the site creator in your browser. Type a name and press **สร้างเว็บใหม่**. Each site then guides you through its own setup and Dashboard.

On other systems, from this folder:

```bash
npm ci
npm run build
npm run start:local
```

Open `http://127.0.0.1:8798` if your browser did not open automatically. Create or open a site in the local creator, then use its setup page to describe your idea without secrets. Save the one-time owner link before continuing; the Studio session expires after 12 hours and Studio sign-in requires that link. You may also create an owner account for the back office. Your draft stays in the site browser tab until sent; configure an AI provider in Studio Settings before sending. The Studio asks before publishing, deleting, sending, or changing sensitive settings. Its Settings page sets per-turn and daily AI budgets. You can also use the back office directly without AI.

The browser creator runs on this computer only. Each site gets its own port, SQLite databases, owner account and Dashboard. Keep the command window open while using a local site. The commands below are optional for people who prefer a terminal:

```bash
npm run new:site -- baan-coffee
npm run open:site -- baan-coffee
npm run new:site -- my-shop
```

The site folders live under `selfhost/sites/` and are private; back them up separately. `new:site` refuses an existing name. To run two sites at once, use two terminal windows. The Cloudflare install button also creates an independent installation for each site; this local command does not deploy to Cloudflare.

The default server listens only on this computer. For an internet site, use HTTPS in front of the Node server, configure `WEB_END_PUBLIC_URL` and `WEB_END_TRUST_PROXY=on`, and keep the data directory private. Set `WEB_END_DATA` to choose its location. `WEB_END_STUDIO=off` stops the builder while the published site and API continue to run. `WEB_END_UPDATE_CHECK=off` stops the release check on GitHub. The `doctor` command shows which integrations and outbound connections are enabled.

```bash
npm run backup -- --data ./data --out ./site-backup.tar.gz
node bin/web-end.mjs verify ./site-backup.tar.gz
node bin/web-end.mjs restore ./site-backup.tar.gz --data ./restored-data
node bin/web-end.mjs doctor --data ./restored-data
```

The backup contains the site and Studio databases, including customer password hashes, but omits environment secrets and the Studio master key by default. Keep the master key separately or use `backup --include-key` and secure that file accordingly. Restore stops when the target server is running, checks the archive, stages a complete copy, and preserves replaced data. Recheck your domain, email, payment and OAuth configuration after moving.

Run `npm test` to exercise the SQLite host, full site suite, Studio and backup/restore ownership checks. This mode is an early test; the Cloudflare deployment remains the simpler path for a public site today.

The host and Studio were adapted from the separate Craft Anything prototype `app-base44-com-2/app/system` (MIT). This package builds directly from this repository's `cloud/`; it does not keep a second copy of the engine.
