# web-end

Build and run a full-stack site or simple app by talking to Claude: your own database tables, customer login, a shop with a cart, an API, publishing with version history, a back office for everything, and hosting on your own account. Use its pages, or keep a front end you already have, such as Wix. It's free and open source, and you don't need to write code.

**Status: early test.** The install button and the connection to Claude have worked from start to finish once. Nobody outside the project has tried it yet.

## How it works

You need three free accounts: [Cloudflare](https://dash.cloudflare.com/sign-up), [GitHub](https://github.com/signup) and [Claude](https://claude.ai).

1. **Install.** Click this button and follow Cloudflare's steps. It puts your own copy of web-end in your GitHub account and your website on your own Cloudflare account. It took about 3 minutes in our test.

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/michoder26-cloud/web-end/tree/main/cloud)

   When GitHub asks, choose **Only select repositories**, so your other projects stay out of it. If you land on a different page afterwards, click the button again. When it finishes, open the address that ends in `.workers.dev` (or press **Visit**). Step-by-step install guide: [docs/install.md](docs/install.md).

2. **Start building.** Open your new website and click **Start building free**. The first person to click becomes the owner, then chooses whether to begin with Claude or a working example.
3. **Create your sign-in.** Your back office shows a **Create your sign-in** box until you do: type your name, email and password, with nothing to paste. From then on, sign in at `/admin` on any device.
4. **Keep your way back in.** Until you create that sign-in, the back office address itself is your key, so bookmark it. Lost the password later? `/admin/recover` takes your private owner link.
5. **Connect Claude when you need it.** In the workspace, choose **Build with Claude**, or on `/admin` press **Make my Claude link**. It gives the short one-time steps for Claude’s **Settings → Connectors → Add custom connector** flow. [More help](docs/connect-claude.md).
6. **Or start from an example.** Want a working site right now, without Claude? Pick a café, shop, classes and bookings, services or portfolio example, in English or Thai. Every word and price in it is a clearly marked sample you change later.

### Install directly from your own copy

The button above is the simplest route. If you fork or clone the project yourself, or want to choose where your D1 database is created, use the installer from the `cloud` folder instead. It creates a new Worker and D1 database in the Cloudflare account you are signed in to, applies the migrations and deploys. It never asks for, stores or sends your Cloudflare password or API token.

```bash
cd cloud
npm ci
npm run install:cloudflare -- baan-coffee --location apac
```

For an EU-only database, choose `--jurisdiction eu` instead of a location hint. The installer stops rather than overwrite a configured site; later releases use `npm run deploy`.

Claude asks a few short questions about your business, builds the pages and design, and gives you the link. Your back office shows what's left to do, such as checking the site on your phone and publishing, and ticks each step by itself. Come back any time to change something.

## What you get

- **Design:** 19 kinds of sections, including link lists for sub-menus and resources, five design styles, phone-friendly layouts, and fonts that cover Latin and Thai
- **Database:** your own tables with text, numbers, dates, choices, images and links between tables, plus products, orders and messages. Up to 50 tables of 50,000 records each. Download any table as a spreadsheet file.
- **Access rules:** for each table, choose who can read and add: anyone, logged-in customers, customers' own records only, staff, or only you. Fields can be staff-only, and every rule is enforced on the server.
- **Customer accounts:** sign up, log in, log out, staff roles, a page where customers see their own orders, password reset emails once email is set up, and "Continue with Google" through your own Google client. Turn it on when you need it.
- **API:** other systems and front ends can use your data, logins and orders, with secret keys and an OpenAPI description at `/api/v1/openapi.json`
- **Publishing:** after your first publish, changes stay private with a preview link until you publish them. Go back to any of the last 20 site versions. Each page also keeps its own last 20 versions, so you can undo one page without changing the rest of the website. Data changes at once.
- **Limits nothing can get around:** seats and other places can't be overbooked, even by two people at the same moment, and one customer can't book the same thing twice
- **Backup and restore in two clicks:** download one backup file with every page, image, order, customer (who can still sign in afterwards), table and setting, and restore it from the System page. Before a restore, a copy of the site as it is now downloads by itself, so you can always go back. A readable copy for moving elsewhere is there too.
- **What changed, with Undo:** every change Claude makes is listed in the back office, and pages and settings go back with one click. If Claude keeps changing the same thing, it stops and explains the problem instead of fixing in circles, and it never costs you credits.
- **Free usage you can see:** the System page shows what your site uses against each free limit (database, images, records, page views, emails) and what happens at each one. On the free plans a limit pauses, it never bills you.
- **Notifications:** get an email for each new order, form entry and booking through your own Resend account, get them in Discord, Slack or Telegram for free, or send signed webhooks to other services
- **Automations:** "when this happens, do that" rules that run on your server without code, such as a booking confirmation email, a booking number, a seat taken from a class, a status workflow or a low-stock alert, and schedules such as a summary every evening or a reminder the day before a booking. Claude sets them up from what you say, and you can see them, switch them off and read what they did in the back office.
- **News by email:** send news to customers who agreed to get it, with a box at sign-up and checkout that starts unticked, newsletter forms, confirmation by email first, and a one-click unsubscribe link in every email. Write it yourself or with Claude, preview it, send yourself a test, then send. It goes out in batches inside Resend's free daily limit.
- **Email:** order confirmations with the customer's private order link, an email when an order is paid, shipped, done or cancelled, and password reset emails, in your site's language when it's English or Thai
- **Starters:** five complete sample sites in English and Thai, ready in one click from the back office or through Claude: a café or restaurant, an online shop, classes and bookings with booking numbers, services or coaching, and a portfolio. Samples are labelled as samples, with no made-up reviews, figures, addresses or phone numbers.
- **Build guides for Claude:** planning, data design, access rules, screens, design, copy, shop, publishing, Wix, staff, automations, news by email and launch checks, built in, so there's nothing extra to install
- **System plan:** Claude keeps one versioned plan for each system—its users, modules, expected tables, pages, approval flows, automations and acceptance checks—then compares that plan with the real app before saying it is ready.
- **Visitor statistics without tracking:** visitors, page views, top pages, sites that sent visitors, countries, devices, and orders, messages and bookings with a conversion rate, on a Statistics page in the back office, or ask Claude "how is my site doing?". No cookies, no scripts and no cookie banner. [How it works](#visitor-statistics-and-privacy)
- **System page:** hosting, version, publishing, database use, login, payments, email and connections in one place
- **Shop:** product pages, categories, sale prices, sizes and colours, stock that can't oversell, a cart, free delivery thresholds, private order links and order status. Prices are always set on the server.
- **Payments:** bank transfer, PromptPay QR codes and pay on delivery, plus cards through your own Stripe account
- **Phone-first shopping:** a bottom tab bar and two-column product grid on phones, with no scripts on your pages
- **Owner Dashboard and CMS:** one private workspace with Preview, Dashboard and Edit modes. Manage pages and sections, products, photos, data, customers, orders, approvals, automations, publishing, integrations and system settings with or without Claude. Copy a page into a private draft, then restore an earlier version of that page if needed. It's in Thai or English: a Thai site gets a Thai back office, and you can choose either one in Settings.
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
- Send news to people who didn't agree to get it, or to a list you bought or copied. News goes only to people who signed up and confirmed by email, as shown below.
- Send a lot of news fast on Resend's free plan. It allows 100 emails a day, so news goes out at 90 a day by default: 340 people take four days. A paid Resend plan lets you raise the limit.
- Design news emails freely. They're plain text with paragraphs, links, one image and one button, with no templates, scheduling for later, open tracking or groups of subscribers.
- Give staff finer access than whole areas, such as one table or only some orders, or show staff the full history of who changed what outside orders
- Check bank transfers or PromptPay payments automatically, or take payment slips. The PromptPay QR code fills in the amount for the customer, but nothing tells web-end the money arrived. You check each payment in your banking app and confirm it in the back office.
- Create product photos. Upload your own, or use images you have the right to use.
- Show customer reviews as a ready-made feature
- Add any feature you can describe. Claude builds with tables, rules, pages, automations, webhooks and sandboxed custom code. Automations are a fixed menu of steps, not code: anything they can't express, such as calculations across many records or calling another service and using its answer, still means a developer changing the source, and an update replaces such changes.
- Run something at an exact minute, or more often than once a day. Schedules run within about 15 minutes of their time.
- Log in with Facebook, Apple, LINE or other accounts. Google works once you set it up, as shown below. Google login works on your website, not yet through the API.
- Show the back office in languages other than Thai and English

Passing our tests means common mistakes weren't found. It isn't a security audit or legal advice. Customer passwords use PBKDF2 with 100,000 rounds, the most Cloudflare Workers allow, which is below the 600,000 that security guides recommend. You're responsible for the customer data your site holds. Don't collect health data, ID numbers or card details through forms, and have legal pages checked for your country.

Your Claude link and back office link work like passwords. Keep them safe for connecting Claude and for the one-time `/admin` account setup. After that, use your email and password at `/admin` for the back office. Don't share any owner link with your team; give each person their own staff login instead, as shown below.

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
- **Statistics:** visitors, pages, referring sites, countries, devices and conversions
- **News:** write news email drafts and see their preview. Only you send them, send tests, and see who is subscribed.

Settings, Connect, Automations, System, Updates, Move here, WordPress, the full download of your data, customer accounts, staff access and your private links always stay yours alone. Every page and every change is checked on the server, not just hidden from the menu, and a change must come from a page of your own site. Press **Remove staff access** and it stops at once, even if they're logged in. Making them staff again starts with nothing ticked.

The staff role on its own still lets a person read and change tables you open to staff, on your pages and through the API, as it did before. Orders through the API need **Orders**.

## Visitor statistics and privacy

Your site counts its own visitors as it sends each page, so there's nothing to add and no outside analytics company sees your visitors. Open **Statistics** in your back office, or ask Claude "how is my site doing?".

What is kept, and only as numbers per day: page views for each page, an estimate of visitors, the website that sent each visit (just its name, such as google.com, never the full address), the country Cloudflare reports, the kind of device (phone, tablet or computer) and how many orders, form messages and bookings or other records visitors made.

What is never kept: cookies, scripts on your pages, IP addresses, full browser details or anything that follows a person from one day to the next. To count a person once a day, the site mixes their IP address and browser name with a random code made fresh each day and keeps only a short scrambled result. That code and those results are deleted shortly after midnight in your time zone, so yesterday's visitors can't be matched to today's, or to an address. Like [Plausible](https://plausible.io/data-policy), this means someone who visits on two days counts as two visitors, and two people sharing one network and the same browser may count as one.

Bots that say what they are, your back office, previews, Claude, images and files aren't counted. Daily numbers are kept for 400 days, then deleted. They're in the full download of your data. Turn counting off in **Settings** whenever you like; numbers already counted stay until they're 400 days old.

Each page view writes one row to your database, and a visitor's first page of the day writes one more and one when it's deleted, so about 1.8 rows per view. Cloudflare's free plan allows 100,000 rows written a day, enough for tens of thousands of views. This isn't legal advice: check what your country asks you to say about statistics in your privacy text.

## Updating your site

Open the **Updates** page in your back office. It tells you when a new version is out and walks you through installing it:

1. The first time, follow the link to add the updater to your GitHub repository.
2. From then on, your site updates by itself once a day (at 02:23 UTC) when there's a new version. To update at once, open the updater and press **Run workflow**. Cloudflare rebuilds your site in a few minutes.

If you added the updater before it updated by itself, the Updates page shows the three lines to put in place of `on: workflow_dispatch`, once.

GitHub pauses scheduled updates in a public repository after 60 days with no changes. If that happens, GitHub emails you, and the Updates page's **Run workflow** link still works; pressing **Enable workflow** on GitHub turns the daily check back on.

Your pages, products, orders, customers and private links stay as they are. If a developer changed your site's code, those changes get replaced, but they stay in your GitHub history.

## Moving from Wix

Wix sites can't run anywhere else, so web-end rebuilds your own content instead of copying the site. Keep your old site running until you've checked the new one.

1. Publish your Wix site on its free address, if it isn't already. You don't need to buy a domain.
2. Install web-end, connect Claude, and say: "Move my website here." Claude lists your pages, rebuilds them, copies your photos and tells you what moved and what didn't.
3. If you have a shop, export your products from Wix and upload the file on the **Move here** page of your back office.
4. Read the results on the **Move here** page. An automatic check compares each new page with its old page and lists any text, button labels and photos that didn't come across, so you don't have to take Claude's word for it. It also shows old and new colours and fonts, and any headings in a different order. It can't judge how a page looks, so open both pages side by side.
5. Check the new site on your phone, publish it, then point your domain to it. Old links keep working through the redirects Claude saves.

What doesn't move: customer passwords, payment accounts, orders, reviews, and features from Wix apps. Tables can often replace bookings or members. The new pages keep your colours, the order of your sections, and fonts close to yours, but they won't match pixel for pixel, because they're built from web-end's sections and a Wix template's design and stock photos may not be yours to take. Only move sites you own.

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
- **A readiness report** listing the published pages, products and redirects that will move, and the issues to resolve before pointing your domain at WordPress.

The page also lists what WordPress needs a plugin for, such as forms and tables. Customer passwords and orders don't move. Your design comes from your WordPress theme. Keep this site online until WordPress has copied your photos. The files are tested against WordPress's import format, but we haven't yet imported one into a live WordPress site, so check yours before you rely on it.

## Using it as the backend for Wix or another front end

Keep your pages where they are, and let web-end hold the data, logins and orders. Open **Connect** in your back office to create a secret key, then ask Claude to read its `connect_wix` guide and write the code for you. A key only works from server code, such as Wix backend code. A browser that sends one is refused, so never put one in a page.

This has been tested against the API, but not yet inside a real Wix site, so try it on a copy first.

## Your site in two languages

Many Thai shops serve tourists too. Your site can be in Thai and English, or other languages, at the same time. Ask Claude, for example: "Add English for tourists." Claude reads its `languages` guide, turns on `languages` (your main language first, such as `th, en`) and translates your pages, products, menu and footer.

- Your main language stays at the same addresses. English gets its own, such as `/en/`, `/en/about` and `/en/product/12`.
- Each page has a plain link at the top to the other language. Search engines are told about both versions, and the sitemap lists both.
- Cart, checkout, order pages and order emails follow the visitor's language. Orders keep the product names the customer saw.
- Anything not translated yet shows your main language's words, so nothing breaks. Your preview, such as `/owner/.../preview/en/about`, marks those places, and Claude's site check lists them.
- In the back office, each page and product has a tab for each language, and Settings has a page for the menu and footer.
- Translations of pages and the menu are published with the rest of your changes, and versions keep them. Product translations work at once, like products.
- **Download everything** includes your translations. The WordPress files hold your main language only.

## PromptPay QR codes

For shops that price in Thai baht. After checkout, the customer's order page shows a PromptPay QR code with the exact amount of the order. They scan it with any Thai banking app and pay. The confirmation email links to that page.

1. In your back office's Settings, enter the currency code `thb`.
2. Turn on **Accept PromptPay QR** and enter your PromptPay ID: the mobile number or 13-digit national ID or tax ID your PromptPay is linked to, or a 15-digit e-wallet ID. A 13-digit ID is checked for typing mistakes. You can add the name on the account so customers can check it before they pay.
3. Place a small test order and scan it with your own banking app before you take real orders. The app should show your name and the right amount.

Payments aren't checked automatically. Like a bank transfer, you see the money in your banking app, then mark the order paid in the back office. The code is made on your own site, with no outside service.

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

## Sending news to your customers

Open **News** in your back office, or ask Claude: "Write a news email about our new menu." It needs email set up with Resend, as shown above.

Who gets news: only people who agreed, which Thai law (PDPA) and European law (GDPR) both expect.

- **A box at sign-up and checkout.** Tick **Ask at sign-up and checkout** on the News page, or ask Claude. The box starts unticked.
- **A newsletter form.** Claude can add an unticked box to any form, such as a booking form, or make a form that's only a newsletter sign-up.
- **People who agreed elsewhere,** such as on a sign-up sheet at your shop. Add them on the News page, tick that each person agreed, and write how and when. Never buy, borrow or copy a list.

Each person gets an email to confirm, and nothing else until they do. The News page shows how and when each person agreed and confirmed, and you can remove someone or download everyone as a spreadsheet file. Every news email has a one-click unsubscribe link, plus the headers that put an unsubscribe button in Gmail and other mail apps. Unsubscribing needs no login and works at once. Someone who unsubscribed is never added back unless they sign up again themselves.

Sending:

1. Write a subject and your text. A blank line starts a new paragraph. Add a link like `[our new menu](/menu)`, one photo you uploaded, and one button if you like.
2. Look at the preview, and press **Send a test** to get it yourself.
3. Tick **Send this to … people now** and press **Send**. Claude can send it too, but only after you clearly tell it to.

About every 15 minutes, the next batch goes out, up to **Most news emails a day**, 90 by default. Resend's free plan allows 100 emails a day and 3,000 a month, including your order and password emails, so 90 leaves room for those. The News page shows progress, such as "120 of 340 sent, the rest go out tomorrow". Nobody gets the same news twice, and nobody who unsubscribed or never confirmed gets it at all. **Stop sending** stops the rest. An email Resend refuses isn't tried again. This has been tested against a stand-in for Resend, so send yourself a test before you rely on it.

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

## Automations

Automations are rules like "when a booking comes in, email me" or "when an order is shipped, email the customer". Tell Claude what you want in your own words. It builds the rule from a fixed menu, tries it on your real data without changing anything, and tells you in one sentence what it does.

- **When:** a record is added or changed (or one field changes to a value you choose), a form is sent, an order is placed, an order's status changes, or a customer signs up.
- **Only if:** simple checks on what happened, such as "seats left is less than 1" or "status is confirmed".
- **Then:** fill in fields such as a booking number or today's date, add a record to another table, change a linked record such as taking a seat away from a class, email you, the customer or an address on the record, or send the details to another service.

Automations can also run on a schedule, on your own clock. Set your time zone in **Settings**, such as Asia/Bangkok, or ask Claude to. Until you do, schedules use UTC.

- **Every day** at a time, or only on the weekdays you choose, **every week** on a weekday, or **every month** on a day of the month. Day 31 means the last day of shorter months.
- **Before or after a date** in a table, such as "the day before a booking, email the customer" or "3 days after a visit, ask for a review". Each booking is reminded once for its date. If the date changes, it gets a new reminder.
- **Summary:** a scheduled rule can email you how many records match and a short list, such as today's new bookings, or orders still waiting for payment, or last month's bookings on the 1st.

Cloudflare starts your site's scheduler about every 15 minutes, so a rule for 09:00 runs between 09:00 and about 09:15. You don't need to set anything up in Cloudflare: updates bring the schedule in for you. On the free plan, an account can have 5 of these, and each web-end site uses one. If your site was down when a rule was due, it runs once when the site is back, not once for every time it missed. A reminder for "tomorrow" that missed its whole day is skipped, so nobody gets it on the day itself. To fit the free plan, a date reminder handles 10 records at a time and carries on 15 minutes later, so a day with hundreds of bookings can take a few hours, and a summary looks at the newest 200 records and says so if there were more.

Open **Automations** in your back office to read each rule as a sentence, see when a schedule runs next, switch it off, see its last runs and what went wrong in plain words, or delete it. Rules work at once, without publishing.

They are safe by design: no code runs, what visitors type is only ever used as text, a rule that keeps starting itself stops after 3 rounds, and each rule runs at most 100 times an hour (500 for the whole site). A failed step never stops a visitor's booking or order. Emails need email set up, and automations send at most 100 an hour.

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

Before you announce a new version, publish its release with the tag `v` plus the exact version in `latest.json`, such as `v0.18.0`, then check that everything matches:

```bash
npm run release:check
```

To test logging in with Google against a stand-in for Google on port 8824, start the site with `--var WEBHOOK_ALLOW_HTTP:1 --var GOOGLE_CLIENT_ID:test-client --var GOOGLE_CLIENT_SECRET:test-secret --var GOOGLE_API_BASE:http://localhost:8824`, and run the tests with `GOOGLE_TEST=1`. Like the Resend address, the Google address can only be changed while `WEBHOOK_ALLOW_HTTP` is on.

To test email against a stand-in for Resend on port 8823, start the site with `--var WEBHOOK_ALLOW_HTTP:1 --var RESEND_API_KEY:re_test_fake --var RESEND_API_BASE:http://localhost:8823`, and run the tests with `EMAIL_TEST=1`. The Resend address can only be changed while `WEBHOOK_ALLOW_HTTP` is on, which is for local tests only.

[`template/`](template) is an earlier, heavier version built on Payload CMS for developers who want a full CMS. It needs a paid Cloudflare plan and a Payload release that isn't out yet, and it isn't the recommended way to use web-end.

## License

[MIT](LICENSE). Fonts are under the SIL Open Font License.
