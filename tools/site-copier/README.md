# Site copier (experiment)

Copies a public website page by page so it looks the same, without the original platform's code.

It opens each page in a real browser (Playwright, Chromium), keeps the page as the browser drew it, and saves images, fonts and styles next to it. It also:

- copies a desktop and a phone version (`/m/`), and picks one by screen size;
- records scroll effects (moving backgrounds, a header that hides) and time effects (slideshows), and plays them back with a small script (`motion.js`);
- saves detected Lottie animation data and replays it with a locally bundled MIT-licensed player;
- replaces the Wix map with a Google map in the same light or dark look;
- follows the site's own links, up to 15 pages with `copy.cjs` (`MAXP=n` to change).

Only copy a site you own.

The one-command workflow needs no AI:

```
npm ci
node tools/site-copier/run.cjs https://example.com new-copy
node tools/site-copier/preview.cjs new-copy
```

`--quick` makes a shorter exploratory capture. The workflow follows up to 50 pages by default (`MAXP=n` changes the limit), applies supported front-end adapters, captures expanding menus, FAQ panels and simple Next/Back carousels, and writes `front-end-audit.json` and `visual-report.json`. The audit lists uncopied pages, missing assets, outside requests, broken local links and buttons whose behavior has not been verified. It also tests locally replayed animations. The visual report measures the first viewport and every captured scroll viewport on desktop and phone. If one Lottie animation is present, it matches the closest frame for the first viewport; the audit separately verifies that playback advances. A clean audit means the checked front-end paths worked; it does not promise that every possible interaction on every website was reproduced.

```
node tools/site-copier/copy.cjs https://example.wixsite.com/shop out
node tools/site-copier/compare.cjs out   # pixel similarity across captured scroll viewports
node tools/site-copier/preview.cjs out   # open http://127.0.0.1:8812/
node tools/site-copier/test.cjs          # local two-page smoke test
```

## Back office

`run.cjs` finishes by adding a back office to the copy (`add-backend.cjs`, also usable on its own). The copy then runs as a small website with no extra packages:

```
cd new-copy && node server.cjs      # website on :8080, back office on /admin/
```

- **Messages:** the site's own forms send to the back office. The owner reads, marks, deletes and downloads them as CSV. There is a hidden trap field for bots, a per-visitor rate limit, and cross-site posts are refused.
- **Edit pages:** the owner opens a page, clicks any text to change it and clicks a picture to replace it. The same change goes to the desktop and phone versions. Changes are written into the page files, so the site stays plain HTML.
- **Owner password:** a first password is printed at start and saved in `data/first-password.txt`, and the owner changes it in Settings. Passwords are stored with scrypt, and the sign-in cookie is HttpOnly and SameSite=Strict.
- All owner data is in `data/` and `uploads/`, so copying those two folders makes a backup.

Not done yet: bookings and the shop's checkout are not connected to the back office. Forms that only work inside the original platform's app, such as members areas or Wix Bookings calendars, still need their own replacement. Adding new sections or pages is done by copying again or by hand.

Choose a new output directory for every run. The copier refuses to replace an existing directory. If a page fails or the `MAXP` page limit is reached, links to pages that were not copied open the original site instead of a missing local page. `MOTION_MS` and `SHOT_LIMIT` can shorten exploratory runs; the defaults record full motion and screenshots.

The output includes `copy-report.json` with copied and uncopied page paths. Review this before treating the result as a complete site.

For a Base44 storefront with the `#products` catalog pattern, add independent interactions after copying:

```
node tools/site-copier/copy.cjs https://example.base44.app out
node tools/site-copier/enhance-base44-shop.cjs https://example.base44.app out
node tools/site-copier/preview.cjs out
```

This captures product details and variants from the public page, then adds working filters and a cart stored in the visitor's browser. The original Base44 JavaScript is not included. Customer accounts, inventory authority, orders and payments still need to be connected to a web-end backend; the captured checkout button is disabled until then.
