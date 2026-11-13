# Site copier (experiment)

Copies a public website page by page so it looks the same, without the original platform's code.

It opens each page in a real browser (Playwright, Chromium), keeps the page as the browser drew it, and saves images, fonts and styles next to it. It also:

- copies a desktop and a phone version (`/m/`), and picks one by screen size;
- records scroll effects (moving backgrounds, a header that hides) and time effects (slideshows), and plays them back with a small script (`motion.js`);
- replaces the Wix map with a Google map in the same light or dark look;
- follows the site's own links, up to 15 pages (`MAXP=n` to change).

Only copy a site you own.

```
node tools/site-copier/copy.cjs https://example.wixsite.com/shop out
node tools/site-copier/compare.cjs out   # % of pixels that match, per page and size
```

Not done yet: forms, bookings and the shop still only look right; they are not connected to the web-end back office, and the text and images can't be edited there yet.
