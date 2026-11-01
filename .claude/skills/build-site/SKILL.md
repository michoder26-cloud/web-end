---
name: build-site
description: Builds a complete website with login, database and admin panel for someone who does not write code, using a team of specialist agents. Use when someone asks to create, build or change a website in this project.
---

# Build a site

You lead the team. The person you are helping does not write code. Speak in their language, avoid jargon, and explain every choice in terms of their business.

## 1. Understand the request

Ask only what you cannot work out, a few questions at a time:

- What is the business or project, and who are its customers?
- What should a visitor be able to do? Which pages are needed?
- Do people need accounts? What should they see that others cannot?
- What will the owner want to edit later without help?
- What real content exists: text, photos, prices, contact details?
- Which sites do they like, and what do they like about them?

Save the answers in their words to `docs/spec/brief.md` inside the site folder.

**Stop and explain first** if the site needs card payments held by the site itself, health data, children's data or legal advice. Recommend a hosted service such as Stripe Checkout, and a professional review.

Be open about cost: a domain, Cloudflare Workers Paid from $5/month for this stack, and more of their Claude usage for bigger builds.

## 2. Create the site

From the repo root, for a new site:

```bash
npm run new-site -- site-name
```

The site lives in `sites/site-name`, which Git keeps private.

## 3. Run the team, one role at a time

Use the Agent tool with each role below, in this order. Tell each role the site folder, and to read `docs/spec/` and `docs/handoff/` first. Never run two at once, because they share files and would overwrite each other.

| Step | Role | Must exist before moving on |
| --- | --- | --- |
| 1 | `product-architect` | The spec files. Show the owner a plain summary and get their yes. |
| 2 | `backend-security` | Checks pass: `--only secrets,types,typecheck,access` |
| 3 | `ui-frontend` | Checks pass: `--only typecheck,lint`. Show the owner the pages. |
| 4 | `integrator` | Checks pass: `--only typecheck,lint,access` |
| 5 | `qa-reviewer` | `docs/handoff/qa.md` ends with `READY` |
| 6 | `devops` | Only after the owner says to publish. |

The check command is `npm run gates -- --site sites/site-name`, with the options above.

When a step fails, send the exact problem to the role that owns it, then repeat the check. After three failed attempts on the same problem, stop and tell the owner plainly what is stuck.

## 4. Report honestly

- Read `docs/report.md` and summarise it in the owner's language, including what the checks do not cover.
- Never say something works unless a check or test showed it this session.
- List every `NEEDS OWNER INPUT`, and the steps only the owner can do, such as logging in, paying, or connecting a domain.
- Never enter the owner's passwords or payment details. Never print secrets.

After launch, tell the owner they edit content at `/admin`, and can come back here for anything else.
