import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** Gives a site its own private secret. Git ignores this file and the value is never printed. */
export function writeSiteEnv(siteDir) {
  const file = path.join(siteDir, '.env')
  if (!existsSync(file)) {
    writeFileSync(file, `PAYLOAD_SECRET=${randomBytes(32).toString('hex')}\n`)
  }
}
