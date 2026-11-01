# web-end

An open-source MCP server that lets anyone build and run a website by talking to Claude, without writing code or installing developer tools.

You get a ready-made site on your own Cloudflare account. Connect it to Claude and say what you want: "Make a website for my coffee shop." Claude asks about your business, then writes the pages, sets the design and checks the result. Changes appear straight away, and you can also edit everything in an admin panel.

**Status: early, not ready for real sites.** The MCP server works on a local copy. It can't go online yet because Payload hasn't released a fix for logins on Cloudflare, and it hasn't been connected to the Claude app. See [the stack proof](docs/stack-proof.md).

## How it works for a site owner

These are the planned steps. The deploy step doesn't exist yet.

1. Deploy your own copy of the site to Cloudflare.
2. Open `/admin` and create your account. Do this right away, because the first account becomes the owner.
3. Turn on an API key for your account in the admin panel.
4. In Claude, add a custom connector with `https://your-site/api/mcp` and the key. See [Connect Claude](docs/connect-claude.md).
5. Ask Claude to build your website.

## What Claude can do

| Tool | What it does |
| --- | --- |
| `get_site_overview` | See the settings and every page |
| `update_site` | Change the name, language, colours, font, navigation and footer |
| `save_page`, `get_page`, `delete_page` | Create, read, change and delete pages |
| `add_image`, `list_images` | Save images from a public link |
| `list_messages` | Read messages from contact forms |
| `check_site` | Review the site for common problems |

Pages are built from seven blocks: hero, text, features, gallery, FAQ, call to action and contact form. The server also gives Claude a working method: plan, write, design, build, then review.

## Why it's built this way

Claude edits content and design, and doesn't write code on your site. Every site runs the same tested engine, so login and permissions don't have to be rewritten by AI for each person.

The limit is that it does what the engine supports. It can't add new kinds of features or take card payments itself. To sell something, link to a hosted service such as Stripe Payment Links.

## What it costs

The software is free and open source. Running a site isn't quite free:

- **Claude:** custom connectors are [available on every plan](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp). The free plan allows one.
- **Cloudflare:** expect Workers Paid at [$5/month minimum per account](https://developers.cloudflare.com/workers/platform/pricing/). Whether the free plan can handle login is untested.
- **Domain:** optional, a yearly fee to your registrar.

## For contributors

You need [Git](https://git-scm.com) and [Node.js](https://nodejs.org) 22.23.4 or newer.

```bash
git clone https://github.com/michoder26-cloud/web-end.git
```

```bash
cd web-end
```

```bash
npm run setup
```

| Part | Purpose |
| --- | --- |
| `template/src/mcp/` | The MCP server and its tools |
| `template/src/app/api/mcp/` | The `/api/mcp` endpoint and key check |
| `template/src/blocks/`, `template/src/components/` | Page blocks and how they look |
| `scripts/gates/` | Automatic checks: secrets, access rules, library holes, browser tests, speed and SEO |
| `.claude/` | A team of Claude Code agents for developing the engine or building custom sites |

Run every check, then plant known bugs to prove the checks catch them:

```bash
npm run gates -- --site template
```

```bash
npm run gates:test
```

## What this does not replace

Passing the checks means common mistakes weren't found. It isn't a security audit or legal advice. Get a professional review before handling health data or other sensitive personal data, and have legal pages checked for your country.

Password hashing on Cloudflare Workers is capped at 100,000 rounds, lower than the 600,000 Payload uses elsewhere. Sites hosted there will have to use the lower number.

Anyone with your API key can change your site, so treat it like a password. Contact forms have only basic spam protection so far, and there is no limit on how often the MCP endpoint can be called.

## License

[MIT](LICENSE). Payload and the other libraries keep their own licenses.
