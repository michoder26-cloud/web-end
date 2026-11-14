# web-end public copy beta

This is a separate Cloudflare Worker for `copy.tktfdesign.com`. It does not replace the business-site Worker or change `tktfdesign.com`.

## Current implementation

- Google OpenID Connect login with PKCE, state, nonce, verified ID token and private sessions in D1.
- One owner per project. The dashboard, editing and preview issue owner-scoped queries; publication is explicit.
- Three jobs per account per UTC day, four jobs globally per UTC day, one active job per account, ten pages, 200 files and 50 MiB per job. Jobs above 12 minutes fail.
- GitHub Actions runner with public-network checks. Copied files are held in Workers KV. The original site's scripts are removed and the copied site's forms are blocked by CSP.
- Private preview and published site are served from distinct origins. The result reports incomplete pages and deferred backend features.

Cloudflare R2 could not be enabled on this account without its subscription checkout. Workers KV is used to keep this beta on the Free plan, with a 500 MiB admission cap. These caps are conservative because KV Free has 1,000 writes per day. This is a small beta, not unrestricted hosting.

## Move to web-end

A ready project has a **Download for web-end (.zip)** button. The ZIP holds every copied file with the owner's saved text and picture edits written in, plus `README-web-end.txt`. `web-end import-copy site.zip --site NAME --replace` (in `selfhost/`) loads it into a local web-end site. There the copied pages keep their look, and their forms send to Messages. The owner edits words and pictures in the back office and publishes, with versions, page history, customers and products available. The ZIP is built in the Worker without compression, within the 50 MiB project limit.

## Configuration required before a public launch

1. Create a Google OAuth web client. The authorized redirect URI must be `https://copy.tktfdesign.com/auth/google/callback`. Store its client ID and secret as Worker secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
2. Add Worker secrets `RUNNER_SECRET`, `GITHUB_DISPATCH_TOKEN`, and `GITHUB_REPOSITORY=michoder26-cloud/web-end`. The dispatch token needs only permission to dispatch this repository's Actions workflow. Add the same runner secret to the GitHub Actions secret `COPY_RUNNER_SECRET`.
3. Set `PREVIEW_HOST=preview.tktfdesign.com` and `PUBLISHED_HOST=sites.tktfdesign.com` as Worker secrets or environment variables. Map only the three new subdomains to this Worker. Keep `tktfdesign.com` and its current Pages deployment unchanged.
4. Create a free Resend account and verify a sender domain. Store a send-only API key as `RESEND_API_KEY` and the verified sender as `EMAIL_FROM`. The daily retention job emails owners at 76 days of inactivity and deletes content at 90 days, after at least 14 days of notice. **Deletion is disabled when either setting is missing or an email fails.** The beta limits notification sends to 30 per day, below Resend Free's current 100/day cap.
5. Merge `.github/workflows/copy-beta.yml` into the default branch before dispatching jobs. Run the two-account acceptance test on the real subdomains before opening registration.

Never commit OAuth or runner secrets. `wrangler d1 migrations apply DB --remote` must be run before deploying code that uses new tables.

## Remaining launch gates

- The real Google OAuth callback and GitHub Actions dispatch need credentials and a two-account test. They have not been exercised against the production services.
- Moving a project into web-end works through the ZIP download and the local importer. A direct transfer into the owner's own Cloudflare web-end install is not implemented.
- Cloudflare account connection and direct transfer are not implemented. A public UI must not advertise this as available until a public Cloudflare OAuth client and transfer flow exist.
- The 90-day email and deletion path needs a verified Resend account and a live delivery test. Without it the Worker keeps content and stops accepting new jobs at the storage cap.
- Public DNS and Worker routes have not been changed yet.

## Local checks

From this directory: `npm ci`, `npm test`, and `npx wrangler deploy --dry-run`. From the repository root: `node tools/site-copier/test.cjs`. The browser integration check accepts `COPY_PREVIEW_DIR=<copied site directory> node copy-platform/tests/browser-preview.integration.mjs`.
