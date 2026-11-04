# Connect Claude to your site

Your site talks to Claude through a custom connector: a private link that lets Claude build and change your site for you.

## 1. Get your Claude link

1. Open your new website and click **Get my Claude link**. Do this straight away, because the first person to click becomes the owner.
2. The next page shows two links, only once: your **Claude link** and your **back office** link. Copy both into a password manager or a private note. They work like passwords: anyone who has them can change your site. Don't share them with your team. Give each person their own staff login instead.

The Claude link looks like `https://your-site.workers.dev/mcp/abcd2345-…`. Your back office also shows it, on the Overview page, if you need it again.

## 2. Add the connector in Claude

It is easiest on a computer.

1. Open [Claude's connector settings](https://claude.ai/settings/connectors). In Claude, that is your name, then **Settings**, then **Connectors**.
2. Click **Add custom connector**.
3. Give it a name, such as My website, and paste your Claude link as the URL. Leave the advanced settings empty. No sign-in is needed, because the link itself is the key.
4. Click **Add**.

Custom connectors are on every Claude plan. The free plan allows one. On a Team or Enterprise plan, an owner of your Claude organisation may need to add it first. Claude's own guide: [custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## 3. Start building

Start a new chat. Click the **+** button or the tools button and check that your connector is switched on. Then send:

> Hi! Please look at my new website, then ask me a few short questions about my business, one at a time, and build it for me.

Claude looks at your site, asks a few questions with short choices, builds the pages and design, and gives you the link. Your back office ticks **Connect Claude** on its checklist as soon as Claude has used the link.

Want something working before you talk to Claude? Pick a starter on the page that shows your links, or under Starters in your back office. You can still ask Claude to change it afterwards.

## If something goes wrong

- **Opening the Claude link in a browser** shows a page saying it's for Claude, not a browser. Nothing is wrong. Paste it into Claude instead.
- **Claude can't reach the site:** check that you pasted the whole link, including the part after `/mcp/`.
- **You lost your links:** you can reset the site's owner from your Cloudflare account, so keep them safe.
