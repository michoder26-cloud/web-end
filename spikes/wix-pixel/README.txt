Wix pixel spike (experiment, not product code)

Freezes public Wix template demos in a real Chrome, serves them from the local web-end Worker,
and pixel-diffs original vs frozen at 1280 and 390 px. Captured content stays local
(gitignored: spikes/wix-pixel/out/, cloud/public/_frozen/, cloud/.spike-db/). Never commit or publish it.
Only freeze sites the owner owns or demo templates the owner approved.

Needs: root `npm ci` (puppeteer-core comes with lighthouse), Chrome at CHROME_PATH or the default path.

  node capture.mjs <key> <https://www.wix.com/demone2/...> <1280|390> [--baseline]
  (cloud) npx wrangler d1 migrations apply DB --local --persist-to .spike-db
  (cloud) npx wrangler dev --local --port 8805 --persist-to .spike-db --var FROZEN_SPIKE:1
  node compare.mjs <key> <width>                  -> out/results.jsonl, out/<key>/w<width>-diff.png
  node interact.mjs <key> <width> <demo-url> <css> -> out/interact.jsonl (does a click still do anything?)
  node cms-demo.mjs /_frozen/<key>/a/<file>        -> text + image region patched by HTMLRewriter from D1

Worker side: cloud/src/frozen-spike.ts, route /frozen/<key>/<width>, off unless FROZEN_SPIKE=1.
