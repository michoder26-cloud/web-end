# Site copier (experiment)

Copies a public website page by page so it looks the same, without the original platform's code.

It opens each page in a real browser (Playwright, Chromium), keeps the page as the browser drew it, and saves images, fonts and styles next to it. It also:

- copies a desktop and a phone version (`/m/`), and picks one by screen size;
- records scroll effects (moving backgrounds, a header that hides) and time effects (slideshows), and plays them back with a small script (`motion.js`);
- replaces the Wix map with a Google map in the same light or dark look;
- follows the site's own links, up to 15 pages with `copy.cjs` (`MAXP=n` to change).

Only copy a site you own.

The one-command workflow needs no AI:

```
node tools/site-copier/run.cjs https://example.com new-copy
node tools/site-copier/preview.cjs new-copy
```

`--quick` makes a shorter exploratory capture. The workflow follows up to 50 pages by default (`MAXP=n` changes the limit), applies supported front-end adapters, captures safe expanding menus, and writes `front-end-audit.json` and `visual-report.json`. The audit lists uncopied pages, missing assets, outside requests, broken local links and buttons whose behavior has not been verified. The visual report measures similarity of the first viewport on desktop and phone. A clean audit means the checked front-end paths worked; it does not promise that every possible interaction on every website was reproduced.

```
node tools/site-copier/copy.cjs https://example.wixsite.com/shop out
node tools/site-copier/compare.cjs out   # first-viewport pixel similarity, per page and size
node tools/site-copier/preview.cjs out   # open http://127.0.0.1:8812/
node tools/site-copier/test.cjs          # local two-page smoke test
```

Not done yet: forms, bookings and the shop still only look right; they are not connected to the web-end back office, and the text and images can't be edited there yet.

Choose a new output directory for every run. The copier refuses to replace an existing directory. If a page fails or the `MAXP` page limit is reached, links to pages that were not copied open the original site instead of a missing local page. `MOTION_MS` and `SHOT_LIMIT` can shorten exploratory runs; the defaults record full motion and screenshots.

The output includes `copy-report.json` with copied and uncopied page paths. Review this before treating the result as a complete site.

For a Base44 storefront with the `#products` catalog pattern, add independent interactions after copying:

```
node tools/site-copier/copy.cjs https://example.base44.app out
node tools/site-copier/enhance-base44-shop.cjs https://example.base44.app out
node tools/site-copier/preview.cjs out
```

This captures product details and variants from the public page, then adds working filters and a cart stored in the visitor's browser. The original Base44 JavaScript is not included. Customer accounts, inventory authority, orders and payments still need to be connected to a web-end backend; the captured checkout button is disabled until then.
