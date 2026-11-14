# web-end public copy beta

This is a separate Cloudflare Worker for `copy.tktfdesign.com`. It does not replace the business-site Worker or change `tktfdesign.com`.

## Current implementation

- Google OpenID Connect login with PKCE, state, nonce, verified ID token and private sessions in D1.
- One owner per project. The dashboard, editing and preview issue owner-scoped queries; publication is explicit.
- Three jobs per account per UTC day, four jobs globally per UTC day, one active job per account, ten pages, 200 files and 50 MiB per job. Jobs above 12 minutes fail.
- GitHub Actions runner with public-network checks. Copied files are held in Workers KV. The original site's scripts are removed and the copied site's forms are blocked by CSP.
- Private preview and published site are served from distinct origins. The result reports incomplete pages and deferred backend features.

Cloudflare R2 could not be enabled on this account without its subscription checkout. Workers KV is used to keep this beta on the Free plan, with a 500 MiB admission cap. These caps are conservative because KV Free has 1,000 writes per day. This is a small beta, not unrestricted hosting.

## Configuration required before a public launch

1. Create a Google OAuth web client. The authorized redirect URI must be `https://copy.tktfdesign.com/auth/google/callback`. Store its client ID and secret as Worker secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
2. Add Worker secrets `RUNNER_SECRET`, `GITHUB_DISPATCH_TOKEN`, and `GITHUB_REPOSITORY=michoder26-cloud/web-end`. The dispatch token needs only permission to dispatch this repository's Actions workflow. Add the same runner secret to the GitHub Actions secret `COPY_RUNNER_SECRET`.
3. Set `PREVIEW_HOST=preview.tktfdesign.com` and `PUBLISHED_HOST=sites.tktfdesign.com` as Worker secrets or environment variables. Map only the three new subdomains to this Worker. Keep `tktfdesign.com` and its current Pages deployment unchanged.
4. Merge `.github/workflows/copy-beta.yml` into the default branch before dispatching jobs. Run the two-account acceptance test on the real subdomains before opening registration.

Never commit OAuth or runner secrets. `wrangler d1 migrations apply DB --remote` must be run before deploying code that uses new tables.

## Remaining launch gates

- The real Google OAuth callback and GitHub Actions dispatch need credentials and a two-account test. They have not been exercised against the production services.
- Cloudflare account connection and direct transfer are not implemented. A public UI must not advertise this as available until a public Cloudflare OAuth client and transfer flow exist.
- Automatic 90-day deletion and advance email notice are not implemented. Cloudflare Email Sending to arbitrary users requires Workers Paid; a free notification provider or user-visible grace policy must be chosen before deletion is enabled.
- Public DNS and Worker routes have not been changed yet.

## Local checks

From this directory: `npm ci`, `npm test`, and `npx wrangler deploy --dry-run`. From the repository root: `node tools/site-copier/test.cjs`. The browser integration check accepts `COPY_PREVIEW_DIR=<copied site directory> node copy-platform/tests/browser-preview.integration.mjs`.
