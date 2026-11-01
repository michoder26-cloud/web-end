# web-end

A team of Claude agents that builds full-stack websites for people who don't write code. You describe your business in your own words, and the team plans, designs, builds and tests a site with accounts, a database and an admin panel.

**Status: early and not ready for real sites.** The team and its checks run locally. Publishing to Cloudflare is blocked until Payload releases a fix, and no complete site has been built with it yet. See [the stack proof](docs/stack-proof.md).

## What's inside

| Part | Purpose |
| --- | --- |
| `.claude/agents/` | Six roles: architect, backend and security, front end, integration, independent QA, and deployment |
| `.claude/skills/build-site/` | The `/build-site` command that leads the team |
| `.claude/hooks/guard.mjs` | Keeps each role to its own files, protects secrets and blocks dangerous commands |
| `scripts/gates/` | Automatic checks that every site must pass |
| `template/` | The starting site: [Payload](https://payloadcms.com), Next.js, Cloudflare Workers, D1 and R2 |

Roles work one at a time. The QA role cannot change application code, and no role can edit the checks.

## Start

You need [Claude Code](https://code.claude.com), [Git](https://git-scm.com) and [Node.js](https://nodejs.org) 22.23.4 or newer.

```bash
git clone https://github.com/michoder26-cloud/web-end.git
```

```bash
cd web-end
```

```bash
npm run setup
```

Open the folder in Claude Code, accept the workspace trust prompt so the safety hook can run, and type:

```text
/build-site
```

## What it costs

The tools are free and open source. Running a site is not quite free:

- **Claude:** your existing plan. Building a site uses a lot of it.
- **Cloudflare Workers Paid:** expect [$5/month minimum per account](https://developers.cloudflare.com/workers/platform/pricing/). Whether the free plan can handle login is untested.
- **Domain:** a yearly fee to your registrar.

## The checks

```bash
npm run gates -- --site template
```

This looks for secrets, data-model drift, type and lint errors, broken access rules, serious library holes, and failed browser tests on desktop and mobile. It also checks links, speed, accessibility and SEO, then writes a plain-language report to `docs/report.md` in the site folder.

```bash
npm run gates:test
```

This plants known bugs and fake secrets to prove the checks catch them.

## What this does not replace

Passing the checks means common mistakes weren't found. It isn't a security audit or legal advice. Get a professional review before handling payments, health data or other sensitive personal data.

Password hashing on Cloudflare Workers is capped at 100,000 rounds, lower than the 600,000 Payload uses elsewhere. Sites built here will have to use the lower number.

## License

[MIT](LICENSE). Payload and the other libraries keep their own licenses.
