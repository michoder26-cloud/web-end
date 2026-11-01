// Prepares a fresh copy of the repo: tools, Git secret checks, browser and the template.
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { writeSiteEnv } from './lib/site-env.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const run = (command, cwd = root) => execSync(command, { cwd, stdio: 'inherit' })

run('npm install --no-audit --no-fund')
run('git config core.hooksPath .githooks')

const template = path.join(root, 'template')
run('npm ci --no-audit --no-fund', template)
run('npx playwright install chromium', template)
writeSiteEnv(template)

console.log('\nReady. Start a site with: npm run new-site -- my-site')
