// Run before telling installed sites about a new version: npm run release:check
// Installed sites read the version in latest.json and download the tag "v" + that version, so all three must agree.
// A tag named differently, such as v0.18 for 0.18.0, would leave every site unable to update.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const here = new URL('..', import.meta.url)
const latest = JSON.parse(readFileSync(new URL('latest.json', here), 'utf8')).version
const code = /version = '([^']+)'/.exec(readFileSync(new URL('src/version.ts', here), 'utf8'))?.[1]
const problems = []
if (!/^\d+\.\d+\.\d+$/.test(latest)) problems.push(`latest.json has "${latest}", which isn't a version like 1.2.3.`)
if (code !== latest) problems.push(`src/version.ts says ${code} but latest.json says ${latest}.`)

const tag = `v${latest}`
let tagged = ''
try {
  tagged = execFileSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`], { encoding: 'utf8' }).trim()
} catch {
  problems.push('GitHub could not be asked about tags. Check the network and try again.')
}
if (!tagged && !problems.length) problems.push(`There is no tag ${tag} on GitHub yet. Publish a release named exactly ${tag}, or sites can't download this version.`)

if (problems.length) {
  for (const problem of problems) console.error(`not ready  ${problem}`)
  process.exit(1)
}
console.log(`ready      ${tag} exists, and latest.json and src/version.ts both say ${latest}.`)
