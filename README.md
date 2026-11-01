# web-end

Build a full website by talking to Claude. It's free and open source, and you don't need to write code.

**Status: early test.** It works in testing, but the install button and the connection to the Claude app haven't been tried end to end yet.

## How it works

1. **Install.** Click the button. Cloudflare copies web-end to your own GitHub account and puts your website online on your own free Cloudflare account.

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/michoder26-cloud/web-end/tree/main/cloud)

2. **Get your link.** Open your new website and click **Get my Claude link**. Do this straight away, because the first person to click becomes the owner. Save the links it shows you.
3. **Connect Claude.** In Claude's connector settings, add a custom connector with your link and choose no sign-in.
4. **Say what you want.** "Build a website for my coffee shop."

Claude asks about your business, then writes the pages, chooses the design, and gives you the link. Come back any time to change something.

## What you get

- **A website:** 15 kinds of sections, five design styles, and fonts that cover Latin and Thai
- **A database:** forms for bookings and messages, checked on the server
- **A back office:** a private page to read and manage what people send, with no login to remember
- **Search basics:** page titles, descriptions, a sitemap and structured data
- **Full control:** the code is yours, in your own GitHub account. Claude can add custom CSS and sandboxed custom code, and a developer can change anything.

## What it costs

| | Cost |
| --- | --- |
| web-end | Free, MIT license |
| Website hosting and database | Free on Cloudflare's free plan, within [its limits](https://developers.cloudflare.com/workers/platform/limits/). A very busy site can pause until the daily limit resets. |
| Web address | Free `your-site.workers.dev` address. Your own domain is optional, from a registrar. |
| Claude | Custom connectors are [on every plan](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp). The free plan allows one connector and has lower usage limits. |
| Accounts you need | Cloudflare, GitHub and Claude. All have free plans. Nothing to sign up for with web-end. |

Nobody hosts your site but you. There's no central server, and web-end never sees your data.

## What it can't do yet

- Send email, so there are no notifications when a form is sent
- Accounts for your customers
- Take card payments. Link to a hosted service such as Stripe Payment Links.
- Stop double bookings, or run calculations across entries
- Upload images. Use public image links you have the right to use.

Passing our tests means common mistakes weren't found. It isn't a security audit or legal advice. Don't collect health data, ID numbers or card details through forms, and have legal pages checked for your country.

Your Claude link and back office link work like passwords. If you lose them, you can reset the site's owner from your Cloudflare account, so keep them safe.

## For developers

The site is in [`cloud/`](cloud): a Cloudflare Worker with a D1 database and an MCP server at `/mcp/<secret>`. No build step or framework.

```bash
cd cloud
```

```bash
npm install
```

```bash
npm run db:local
```

```bash
npm run dev
```

Then, in a second terminal, test a fresh install. It needs an empty local database.

```bash
BASE_URL=http://localhost:8799 npm test
```

[`template/`](template) is an earlier, heavier version built on Payload CMS for developers who want a full CMS. It needs a paid Cloudflare plan and a Payload release that isn't out yet, and it isn't the recommended way to use web-end.

## License

[MIT](LICENSE). Fonts are under the SIL Open Font License.
