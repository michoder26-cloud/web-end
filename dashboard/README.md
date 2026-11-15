# tktfdesign.com: web-end sign-in and Apps dashboard

The live site at https://tktfdesign.com, kept here as part of the project and as a portfolio piece. **You don't need it to use web-end.** To run your own web-end site, use the install button in the [main README](../README.md).

It is a Cloudflare Pages project (`tktfdesign`) with Pages Functions and a D1 database, and is configured for the tktfdesign.com account. To run your own copy, create your own D1 database and Google OAuth client and change `wrangler.toml`.

- `/` and `/login/`, `/register/`: sign in with Google.
- `/account/`: the Apps dashboard. Owners keep a list of their web-end sites. Each site runs on the owner's own Cloudflare account; this list only stores its name and address.
- `/privacy/`: what is stored.
- `/research/`: the Thai research report from `docs/research-report-th.md`.

## Build, test and deploy

From this folder:

```
npm ci
npm test
npm run build
npx wrangler d1 migrations apply tktfdesign-accounts --remote   # only after adding a migration
npx wrangler pages deploy --branch main --commit-dirty=true
```

`scripts/generate.mjs` writes the sign-in, register, privacy and research pages. `account/index.html` is written by hand.

## Configuration

`wrangler.toml` binds the D1 database `tktfdesign-accounts` as `DB`. Google sign-in needs the Pages secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, set with `npx wrangler pages secret put <name> --project-name tktfdesign`. The OAuth client's redirect URI is `https://tktfdesign.com/auth/google/callback`. Never commit secrets.

`public/_redirects` keeps the old tktfdesign.com URLs pointing to tktf.at or the homepage.
