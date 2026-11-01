// Copies the template into sites/<name>, or to any path inside examples/.
import { execSync } from 'node:child_process'
import { cpSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { writeSiteEnv } from './lib/site-env.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const name = process.argv[2]

if (!name || !/^(examples\/)?[a-z0-9][a-z0-9-]*$/.test(name)) {
  console.error('Usage: npm run new-site -- my-site (lowercase letters, numbers and dashes)')
  process.exit(1)
}

const target = path.join(root, name.startsWith('examples/') ? name : path.join('sites', name))
if (existsSync(target)) {
  console.error(`${path.relative(root, target)} already exists.`)
  process.exit(1)
}

const skip = new Set(['node_modules', '.next', '.open-next', '.wrangler', '.gates-db', 'test-results', 'playwright-report'])
cpSync(path.join(root, 'template'), target, {
  recursive: true,
  filter: (source) => {
    const base = path.basename(source)
    return !skip.has(base) && !(base.startsWith('.env') && base !== '.env.example')
  },
})

writeSiteEnv(target)
execSync('npm ci --no-audit --no-fund', { cwd: target, stdio: 'inherit' })
console.log(`\nCreated ${path.relative(root, target)}`)
