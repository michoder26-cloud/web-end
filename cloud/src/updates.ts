import { escapeHtml } from './http'
import { officeWords } from './office-words'
import type { OfficeWords } from './office-words'
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

export function updatesBody(base: string, repo: string | undefined, latest: Awaited<ReturnType<typeof latestRelease>>, t: OfficeWords = officeWords()) {
  const action = `${escapeHtml(base)}/updates`
  const status = !latest
    ? `<p role="alert">${t.couldNotCheck(version)}</p>`
    : isNewer(latest.version, version)
      ? `<p role="status">${t.newVersion(escapeHtml(latest.version), version)}${latest.notes ? `<br>${escapeHtml(latest.notes)}` : ''}</p>`
      : `<p role="status">${t.latestVersion(version)}</p>`
  const repoForm = `<form action="${action}" class="contact-form" method="post"><label>${t.repoLabel}<input name="repo" pattern="[A-Za-z0-9\\-]+/[A-Za-z0-9._\\-]+" required value="${escapeHtml(repo)}"></label><button class="button button--small" type="submit">${t.save}</button></form>`
  if (!repo) return `${status}<h2>${t.setUpUpdates}</h2><p>${t.setUpUpdatesHelp}</p>${repoForm}`
  const addUrl = `https://github.com/${repo}/new/main?filename=${encodeURIComponent(`.github/workflows/${workflowFile}`)}&value=${encodeURIComponent(workflow)}`
  const runUrl = `https://github.com/${repo}/actions/workflows/${workflowFile}`
  return `${status}
<h2>${t.howToUpdate}</h2>
<ol class="cms-steps">
<li>${t.updateStep1(escapeHtml(addUrl))}</li>
<li>${t.updateStep2(escapeHtml(runUrl))}</li>
<li>${t.updateStep3}</li>
<li>${t.updateStep4}</li>
</ol>
<p>${t.updateKeeps}</p>
<h2>${t.repository}</h2>${repoForm}`
}
