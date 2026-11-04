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

- **Design:** 19 kinds of sections, including link lists for sub-menus and resources, five design styles, phone-friendly layouts, and fonts that cover Latin and Thai
- **Database:** your own tables with text, numbers, dates, choices, images and links between tables, plus products, orders and messages. Up to 50 tables of 50,000 records each. Download any table as a spreadsheet file.
- **Access rules:** for each table, choose who can read and add: anyone, logged-in customers, customers' own records only, staff, or only you. Fields can be staff-only, and every rule is enforced on the server.
- **Customer accounts:** sign up, log in, log out, staff roles, a page where customers see their own orders, password reset emails once email is set up, and "Continue with Google" through your own Google client. Turn it on when you need it.
- **API:** other systems and front ends can use your data, logins and orders, with secret keys and an OpenAPI description at `/api/v1/openapi.json`
- **Publishing:** after your first publish, changes stay private with a preview link until you publish them. Go back to any of the last 20 versions. Version history covers pages and settings, while data changes at once.
- **Limits nothing can get around:** seats and other places can't be overbooked, even by two people at the same moment, and one customer can't book the same thing twice
- **Your data can leave with you:** download all your content and data in one file at any time
- **Notifications:** get an email for each new order, form entry and booking through your own Resend account, get them in Discord, Slack or Telegram for free, or send signed webhooks to other services
- **Email:** order confirmations with the customer's private order link, an email when an order is paid, shipped, done or cancelled, and password reset emails, in your site's language when it's English or Thai
- **Build guides for Claude:** planning, data design, access rules, screens, design, copy, shop, publishing, Wix, staff and launch checks, built in, so there's nothing extra to install
- **System page:** hosting, version, publishing, database use, login, payments, email and connections in one place
- **Shop:** product pages, categories, sale prices, sizes and colours, stock that can't oversell, a cart, free delivery thresholds, private order links and order status. Prices are always set on the server.
- **Payments:** bank transfer and pay on delivery, plus cards through your own Stripe account
- **Phone-first shopping:** a bottom tab bar and two-column product grid on phones, with no scripts on your pages
- **Back office (CMS):** a private page to edit pages and sections, products, photos, menus, colours, orders and customers, with or without Claude. It's in Thai or English: a Thai site gets a Thai back office, and you can choose either one in Settings.
- **Staff logins:** your team logs in with their own accounts and sees only the parts of the back office you tick for each person, such as orders, products, pages or messages. Settings, connections and your private links stay yours.
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

- Send email without an email account of your own. Emails go through your own Resend account, which you set up once, as shown below. Until then there are no emails, and if a customer forgets a password, you make a reset link in the back office and send it yourself.
- Send newsletters. Customers get an email when their order is placed and when its status changes, but nothing else.
- Give staff finer access than whole areas, such as one table or only some orders, or show staff the full history of who changed what outside orders
- Check bank transfers automatically or take payment slips. You check each transfer and confirm it in the back office.
- Create product photos. Upload your own, or use images you have the right to use.
- Show customer reviews as a ready-made feature
- Add any feature you can describe. Claude builds with tables, rules, pages, webhooks and sandboxed custom code. Custom server logic still means a developer changing the source, and an update replaces such changes.
- Log in with Facebook, Apple, LINE or other accounts. Google works once you set it up, as shown below. Google login works on your website, not yet through the API.
- Show the back office in languages other than Thai and English

Passing our tests means common mistakes weren't found. It isn't a security audit or legal advice. Customer passwords use PBKDF2 with 100,000 rounds, the most Cloudflare Workers allow, which is below the 600,000 that security guides recommend. You're responsible for the customer data your site holds. Don't collect health data, ID numbers or card details through forms, and have legal pages checked for your country.

Your Claude link and back office link work like passwords. If you lose them, you can reset the site's owner from your Cloudflare account, so keep them safe. Don't share them with your team. Give each person their own staff login instead, as shown below.

## Giving your team their own login

Staff log in on your website with their own email and password and open `/staff`, a back office that shows only what you allow. You never share your private links.

1. Turn on customer accounts in **Settings**, if they're off.
2. Ask each person to sign up on your website.
3. In your back office, open **Customers**, press **Make staff** next to them, tick what they may do and press **Save access**. Or ask Claude: "Make Somchai staff for orders and products."
4. They log in on your website and open `your-site/staff`. Staff also see a link to it on their account page.

What you can give, one by one:

- **Orders:** see orders with the customer's details and change their status. The orders page shows who changed each status.
- **Products and images**
- **Pages:** edit pages and see the preview. Changes stay private until someone with **Publish** makes them live. Before your first publish, page changes show at once.
- **Publish:** make changes live and go back to older versions
- **Data:** add, change and delete records in tables open to staff. Owner-only tables stay hidden, and only you change a table's fields or delete it.
- **Messages and bookings** from your forms
- **Customers:** see the list of names and emails, nothing more

Settings, Connect, System, Updates, Move here, WordPress, the full download of your data, customer accounts, staff access and your private links always stay yours alone. Every page and every change is checked on the server, not just hidden from the menu, and a change must come from a page of your own site. Press **Remove staff access** and it stops at once, even if they're logged in. Making them staff again starts with nothing ticked.

The staff role on its own still lets a person read and change tables you open to staff, on your pages and through the API, as it did before. Orders through the API need **Orders**.

## Updating your site

Open the **Updates** page in your back office. It tells you when a new version is out and walks you through installing it:

1. The first time, follow the link to add the updater to your GitHub repository.
2. Open the updater and press **Run workflow**. Cloudflare rebuilds your site in a few minutes.

Your pages, products, orders, customers and private links stay as they are. If a developer changed your site's code, those changes get replaced, but they stay in your GitHub history.

## Moving from Wix

Wix sites can't run anywhere else, so web-end rebuilds your own content instead of copying the site. Keep your old site running until you've checked the new one.

1. Publish your Wix site on its free address, if it isn't already. You don't need to buy a domain.
2. Install web-end, connect Claude, and say: "Move my website here." Claude lists your pages, rebuilds them, copies your photos and tells you what moved and what didn't.
3. If you have a shop, export your products from Wix and upload the file on the **Move here** page of your back office.
4. Read the results on the **Move here** page. An automatic check compares each new page with its old page and lists any text, button labels and photos that didn't come across, so you don't have to take Claude's word for it. It can't judge how a page looks.
5. Check the new site on your phone, publish it, then point your domain to it. Old links keep working through the redirects Claude saves.

What doesn't move: customer passwords, payment accounts, orders, reviews, and features from Wix apps. Tables can often replace bookings or members. The design will be new, because a Wix template's design and stock photos may not be yours to take. Only move sites you own.

## Keeping your database in the EU

Cloudflare can restrict a database so it only runs and stores data in the EU. This has to be chosen when the database is created and can't be changed later. The install button can't choose it, so do this right after installing, before you add anything:

1. In Cloudflare, open **D1 SQL Database** and create a database. Under **Data location**, choose **Specify jurisdiction**, then **EU**.
2. In your site's GitHub repository, open `wrangler.jsonc` and replace `database_id` and `database_name` with the new database's.
3. Wait for Cloudflare to rebuild your site. Then open it and click **Get my Claude link**.

We ran web-end's full test suite against a real EU database, and it passed. We haven't yet tried these exact steps on a new install, so check that your site opens before you rely on them.

This covers where your database lives, including uploaded photos. Requests can still be handled by Cloudflare's servers near each visitor, and Claude and any services you connect have their own rules. It doesn't make your site GDPR compliant by itself, so have that checked for your business.

## Moving to WordPress

Wix can't export a site to WordPress, so web-end works as the bridge. Move your Wix site here first, then open **WordPress** in your back office. It gives you:

- **A WordPress file** with your pages, photos and menu. In WordPress, open **Tools**, **Import**, **WordPress**, and tick **Download and import file attachments**.
- **A WooCommerce file** with your products, prices, sale prices, stock, categories, photos and options.
- **An old links file** for the Redirection plugin, so links to your old site keep working.

The page also lists what WordPress needs a plugin for, such as forms and tables. Customer passwords and orders don't move. Your design comes from your WordPress theme. Keep this site online until WordPress has copied your photos. The files are tested against WordPress's import format, but we haven't yet imported one into a live WordPress site, so check yours before you rely on it.

## Using it as the backend for Wix or another front end

Keep your pages where they are, and let web-end hold the data, logins and orders. Open **Connect** in your back office to create a secret key, then ask Claude to read its `connect_wix` guide and write the code for you. A key only works from server code, such as Wix backend code. A browser that sends one is refused, so never put one in a page.

This has been tested against the API, but not yet inside a real Wix site, so try it on a copy first.

## Taking cards with Stripe

Card payments use your own Stripe account, and card details stay on Stripe's page. This hasn't been tried with a real Stripe account yet, so test it in Stripe's test mode first.

1. In Stripe, add a webhook to `https://your-address/stripe/webhook` for the `checkout.session.completed` event.
2. In your Cloudflare Worker's settings, add the secrets `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
3. In your back office's Settings, enter your currency code, such as `thb`, and turn on cards.

Stripe charges its own fees. web-end adds none.

## Sending email with Resend

Emails go out through your own [Resend](https://resend.com) account, so they come from your own address. Once it's set up:

- Customers can click **Forgot your password?** on the login page and get a link to choose a new one. The page never says whether an account uses that email.
- Customers get an order confirmation with their private order link, if they enter an email at checkout or are logged in.
- Customers get an email, with a private link to their order, when you, your staff or Claude mark it paid, shipped, done or cancelled. Choosing the status it already has sends nothing, going back to pending stays quiet, and a card payment Stripe confirms doesn't send one, because the customer sees it on screen.
- You get an email for each new order, form entry and record that visitors add.

You need your own domain, such as `your-shop.com`, because Resend only sends from domains you've verified.

1. Sign up at Resend. Its free plan sends up to 100 emails a day and 3,000 a month.
2. In Resend, open **Domains**, add your domain, and add the records it shows at the company where you bought the domain. Wait until Resend says it's verified.
3. In Resend, open **API Keys** and create a key with **Sending access**.
4. In Cloudflare, open your Worker, then **Settings**, **Variables and Secrets**. Add a secret named `RESEND_API_KEY` and paste the key.
5. In your back office's **Settings**, under **Email**, enter the address to send from, such as `orders@your-shop.com`, and your own address for new orders and messages. Save.
6. Open **System** and press **Send me a test email**.

If only part of this is done, **System** and Claude's site check tell you what's missing. Emails pass through Resend, so their terms apply to them. web-end itself still never sees your data. Each email is sent once, with no retry, and you get at most 60 notices an hour, so a flood of spam can't use up your allowance. This has been tested against a stand-in for Resend, but not yet with a real Resend account, so send a test email and place a test order before you rely on it.

## Logging in with Google

Customers can press **Continue with Google** on the login and sign-up pages instead of choosing a password. It uses your own Google client, so Google shows your site's name, and web-end never sees your data. It's free. This has been tested against a stand-in for Google, but not yet with a real Google account, so try it yourself before you tell customers.

1. In your back office, open **System** and copy the **Redirect address for Google**. It looks like `https://your-address/login/google/callback`.
2. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project, or pick one you have.
3. Open **Google Auth Platform** (called **OAuth consent screen** in some accounts). Enter your site's name and your email, choose **External**, and finish the steps. Google asks for these so customers know who they are logging in to.
4. Open **Clients** (or **Credentials**), create an **OAuth client ID**, and choose **Web application**. Under **Authorized redirect URIs**, paste the address from step 1. If customers also use your own domain, add that address too, with your domain in it.
5. Google shows a **client ID** and a **client secret**. In Cloudflare, open your Worker, then **Settings**, **Variables and Secrets**. Add a secret named `GOOGLE_CLIENT_ID` with the client ID, and another named `GOOGLE_CLIENT_SECRET` with the client secret.
6. Make sure customer accounts are on in your back office's **Settings**. Open your site's login page and try **Continue with Google**.

While your Google app is in testing, only the test users you add in Google can log in. Publish the app in Google Auth Platform to let everyone in. Google usually doesn't need to review an app that only asks for name and email.

How accounts work:

- Someone new gets an account with their Google name and email, and no password. They can choose one later with **Forgot your password?** once email is set up, or with a reset link you make in the back office.
- If an account already uses the same email, a Google login opens that account, but only when Google has confirmed the person owns that email. After that, the account is linked to their Google account, so it still works if they change their Gmail address.
- Google logins follow the same rules as everyone else: the same member role, members-only checkout, and the same limits on attempts.

If only one of the two secrets is set, **System** and Claude's site check tell you what's missing. Nothing shows to customers until both are set. To turn it off, delete the two secrets in Cloudflare.

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

To test logging in with Google against a stand-in for Google on port 8824, start the site with `--var WEBHOOK_ALLOW_HTTP:1 --var GOOGLE_CLIENT_ID:test-client --var GOOGLE_CLIENT_SECRET:test-secret --var GOOGLE_API_BASE:http://localhost:8824`, and run the tests with `GOOGLE_TEST=1`. Like the Resend address, the Google address can only be changed while `WEBHOOK_ALLOW_HTTP` is on.

To test email against a stand-in for Resend on port 8823, start the site with `--var WEBHOOK_ALLOW_HTTP:1 --var RESEND_API_KEY:re_test_fake --var RESEND_API_BASE:http://localhost:8823`, and run the tests with `EMAIL_TEST=1`. The Resend address can only be changed while `WEBHOOK_ALLOW_HTTP` is on, which is for local tests only.

[`template/`](template) is an earlier, heavier version built on Payload CMS for developers who want a full CMS. It needs a paid Cloudflare plan and a Payload release that isn't out yet, and it isn't the recommended way to use web-end.

## License

[MIT](LICENSE). Fonts are under the SIL Open Font License.
