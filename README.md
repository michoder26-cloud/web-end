# web-end

Build and run a full-stack site or simple app by talking to Claude: your own database tables, customer login, a shop with a cart, an API, publishing with version history, a back office for everything, and hosting on your own account. Use its pages, or keep a front end you already have, such as Wix. It's free and open source, and you don't need to write code.

**Status: early test.** The install button and the connection to Claude have worked from start to finish once. Nobody outside the project has tried it yet.

## How it works

Before you start, you need free [Cloudflare](https://dash.cloudflare.com/sign-up) and [GitHub](https://github.com/signup) accounts, and a Claude account.

1. **Install.** Click the button and follow Cloudflare's steps. It copies web-end to your own GitHub account and puts your website online on your own free Cloudflare account. You only do this once, and it took about 3 minutes in our test.

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/michoder26-cloud/web-end/tree/main/cloud)

   The first time, GitHub asks you to let Cloudflare read and change your code. Choose **Only select repositories** so your other projects stay out of it. If you land on a different page afterwards, click the button above again.

2. **Get your link.** Open your new website and click **Get my Claude link**. Do this straight away, because the first person to click becomes the owner. Save the links it shows you, because they appear only once.
3. **Connect Claude.** In Claude's connector settings, add a custom connector with your link and choose no sign-in.
4. **Say what you want.** "Build a website for my coffee shop."

Claude asks about your business, then writes the pages, chooses the design, and gives you the link. Come back any time to change something.

## What you get

- **Design:** 18 kinds of sections, five design styles, phone-friendly layouts, and fonts that cover Latin and Thai
- **Database:** your own tables with text, numbers, dates, choices, images and links between tables, plus products, orders and messages. Up to 50 tables of 50,000 records each. Download any table as a spreadsheet file.
- **Access rules:** for each table, choose who can read and add: anyone, logged-in customers, customers' own records only, staff, or only you. Fields can be staff-only, and every rule is enforced on the server.
- **Customer accounts:** sign up, log in, log out, staff roles, and a page where customers see their own orders. Turn it on when you need it.
- **API:** other systems and front ends can use your data, logins and orders, with secret keys and an OpenAPI description at `/api/v1/openapi.json`
- **Publishing:** after your first publish, changes stay private with a preview link until you publish them. Go back to any of the last 20 versions. Version history covers pages and settings, while data changes at once.
- **Limits nothing can get around:** seats and other places can't be overbooked, even by two people at the same moment, and one customer can't book the same thing twice
- **Your data can leave with you:** download all your content and data in one file at any time
- **Notifications:** get new orders and bookings in Discord, Slack or Telegram for free, or send signed webhooks to other services
- **Build guides for Claude:** planning, data design, access rules, screens, design, copy, shop, publishing, Wix and launch checks, built in, so there's nothing extra to install
- **System page:** hosting, version, publishing, database use, login, payments and connections in one place
- **Shop:** product pages, categories, sale prices, sizes and colours, stock that can't oversell, a cart, free delivery thresholds, private order links and order status. Prices are always set on the server.
- **Payments:** bank transfer and pay on delivery, plus cards through your own Stripe account
- **Phone-first shopping:** a bottom tab bar and two-column product grid on phones, with no scripts on your pages
- **Back office (CMS):** a private page to edit pages and sections, products, photos, menus, colours, orders and customers, with or without Claude
- **Photo upload:** PNG, JPEG, WebP or GIF, up to 1 MB each, stored in your own database
- **Search basics:** page titles, descriptions, a sitemap and structured data
- **Full control:** the code is yours, in your own GitHub account. Claude can add custom CSS and custom code in a sandbox, and a developer can change anything.

## What it costs

| | Cost |
| --- | --- |
| web-end | Free, MIT license |
| Website hosting and database | Free on Cloudflare's free plan, within [its limits](https://developers.cloudflare.com/workers/platform/limits/). A very busy site can pause until the daily limit resets. |
| Web address | Free `your-site.workers.dev` address. Your own domain is optional, from a registrar. |
| Claude | Custom connectors are [on every plan](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp). The free plan allows one connector and has lower usage limits. |
| Accounts you need | Cloudflare, GitHub and Claude. All have free plans. Nothing to sign up for with web-end. |

Nobody hosts your site but you. There's no central server, and web-end never sees your data. The site and its forms are your responsibility.

## What it can't do yet

- Send email. There are no notifications when a form is sent. If a customer forgets a password, you make a reset link in the back office and send it yourself.
- Check bank transfers automatically or take payment slips. You check each transfer and confirm it in the back office.
- Create product photos. Upload your own, or use images you have the right to use.
- Show customer reviews as a ready-made feature
- Add any feature you can describe. Claude builds with tables, rules, pages, webhooks and sandboxed custom code. Custom server logic still means a developer changing the source, and an update replaces such changes.
- Log in with Google or other accounts
- Show the back office in other languages. It's in English for now.

Passing our tests means common mistakes weren't found. It isn't a security audit or legal advice. Customer passwords use PBKDF2 with 100,000 rounds, the most Cloudflare Workers allow, which is below the 600,000 that security guides recommend. You're responsible for the customer data your site holds. Don't collect health data, ID numbers or card details through forms, and have legal pages checked for your country.

Your Claude link and back office link work like passwords. If you lose them, you can reset the site's owner from your Cloudflare account, so keep them safe.

## Updating your site

Open the **Updates** page in your back office. It tells you when a new version is out and walks you through installing it:

1. The first time, follow the link to add the updater to your GitHub repository.
2. Open the updater and press **Run workflow**. Cloudflare rebuilds your site in a few minutes.

Your pages, products, orders, customers and private links stay as they are. If a developer changed your site's code, those changes get replaced, but they stay in your GitHub history.

## Using it as the backend for Wix or another front end

Keep your pages where they are, and let web-end hold the data, logins and orders. Open **Connect** in your back office to create a secret key, then ask Claude to read its `connect_wix` guide and write the code for you. A key only works from server code, such as Wix backend code. A browser that sends one is refused, so never put one in a page.

This has been tested against the API, but not yet inside a real Wix site, so try it on a copy first.

## Taking cards with Stripe

Card payments use your own Stripe account, and card details stay on Stripe's page. This hasn't been tried with a real Stripe account yet, so test it in Stripe's test mode first.

1. In Stripe, add a webhook to `https://your-address/stripe/webhook` for the `checkout.session.completed` event.
2. In your Cloudflare Worker's settings, add the secrets `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
3. In your back office's Settings, enter your currency code, such as `thb`, and turn on cards.

Stripe charges its own fees. web-end adds none.

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
