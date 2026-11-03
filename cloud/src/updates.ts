import { escapeHtml } from './http'
import { version } from './version'

const latestUrl = 'https://raw.githubusercontent.com/michoder26-cloud/web-end/main/cloud/latest.json'
const workflowFile = 'update-web-end.yml'

// Only tagged releases reach installed sites, so unfinished work on main never does.
const workflow = `name: Update web-end
on: workflow_dispatch
permissions:
  contents: write
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Update to the latest release
        run: |
          set -e
          latest=$(curl -fsSL ${latestUrl} | node -pe 'JSON.parse(require("fs").readFileSync(0)).version')
          git clone --depth 1 --branch "v$latest" https://github.com/michoder26-cloud/web-end.git /tmp/web-end
          node /tmp/web-end/cloud/scripts/update.mjs /tmp/web-end/cloud "$GITHUB_WORKSPACE"
          git add -A
          if git diff --cached --quiet; then exit 0; fi
          git config user.name "web-end updater"
          git config user.email "updater@users.noreply.github.com"
          git commit -m "Update web-end to $latest"
          git push
`

const parts = (value: string) => value.split('.').map(Number)
export const isNewer = (candidate: string, current: string) => {
  const [a, b] = [parts(candidate), parts(current)]
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return (a[index] ?? 0) > (b[index] ?? 0)
  return false
}

/** Asks GitHub for the newest release. If that fails, the back office simply says it couldn't check. */
export async function latestRelease() {
  try {
    const response = await fetch(latestUrl, { cf: { cacheEverything: true, cacheTtl: 3600 }, signal: AbortSignal.timeout(2500) } as RequestInit)
    if (!response.ok) return null
    const data = (await response.json()) as { notes?: unknown; version?: unknown }
    if (typeof data.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(data.version)) return null
    return { notes: typeof data.notes === 'string' ? data.notes : '', version: data.version }
  } catch {
    return null
  }
}

export const repoPattern = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/

export function updatesBody(code: string, repo: string | undefined, latest: Awaited<ReturnType<typeof latestRelease>>) {
  const action = `/owner/${escapeHtml(code)}/updates`
  const status = !latest
    ? `<p role="alert">Couldn't check for a new version right now. You have version ${version}.</p>`
    : isNewer(latest.version, version)
      ? `<p role="status"><strong>Version ${escapeHtml(latest.version)} is available.</strong> You have version ${version}.${latest.notes ? `<br>${escapeHtml(latest.notes)}` : ''}</p>`
      : `<p role="status">You have the latest version, ${version}.</p>`
  const repoForm = `<form action="${action}" class="contact-form" method="post"><label>Your site's GitHub repository, such as your-name/my-website<input name="repo" pattern="[A-Za-z0-9\\-]+/[A-Za-z0-9._\\-]+" required value="${escapeHtml(repo)}"></label><button class="button button--small" type="submit">Save</button></form>`
  if (!repo) return `${status}<h2>Set up updates</h2><p>Enter the GitHub repository Cloudflare created for your site. You can see it in Cloudflare under your Worker's Settings, Build.</p>${repoForm}`
  const addUrl = `https://github.com/${repo}/new/main?filename=${encodeURIComponent(`.github/workflows/${workflowFile}`)}&value=${encodeURIComponent(workflow)}`
  const runUrl = `https://github.com/${repo}/actions/workflows/${workflowFile}`
  return `${status}
<h2>How to update</h2>
<ol class="cms-steps">
<li><strong>First time only:</strong> <a href="${escapeHtml(addUrl)}" rel="noopener noreferrer" target="_blank">add the updater to GitHub</a>, then press <em>Commit changes</em>.</li>
<li><a href="${escapeHtml(runUrl)}" rel="noopener noreferrer" target="_blank">Open the updater</a>, press <em>Run workflow</em>, then <em>Run workflow</em> again.</li>
<li>Wait while Cloudflare rebuilds your site. It usually takes a few minutes, and it can wait in a queue for 10 minutes or more. Refresh this page and the version number changes.</li>
<li>Start a new chat with Claude. New abilities can take a while to appear there. If one is missing, turn the connector off and on in Claude's settings.</li>
</ol>
<p>Your pages, products, orders, customers and private links stay as they are. If a developer changed your site's code, those changes get replaced, but they stay in your GitHub history.</p>
<h2>Repository</h2>${repoForm}`
}
