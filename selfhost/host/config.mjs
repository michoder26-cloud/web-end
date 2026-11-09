// Settings come from the command line, then environment variables, then <data>/.env. Nothing is required:
// a fresh `web-end serve` keeps everything in ./data and listens on this computer only.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** The settings the engine itself reads (see engine/src/types.ts). Only these are passed to it. */
export const engineKeys = ['GOOGLE_API_BASE', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'RESEND_API_BASE', 'RESEND_API_KEY', 'STRIPE_API_BASE', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'WEBHOOK_ALLOW_HTTP']

export function readEnvFile(file) {
  const values = {}
  if (!existsSync(file)) return values
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const found = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (!found || line.trim().startsWith('#')) continue
    values[found[1]] = found[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return values
}

const flag = (value, fallback) => (value === undefined || value === '' ? fallback : /^(1|true|yes|on)$/i.test(String(value)))

export function loadConfig(options = {}) {
  const dataDir = resolve(options.dataDir ?? process.env.WEB_END_DATA ?? 'data')
  const fileEnv = readEnvFile(join(dataDir, '.env'))
  const read = (name) => options.env?.[name] ?? process.env[name] ?? fileEnv[name]
  const engineEnv = {}
  for (const key of engineKeys) if (read(key) !== undefined) engineEnv[key] = String(read(key))
  return {
    dataDir,
    databaseFile: join(dataDir, 'site.sqlite'),
    engineEnv,
    host: options.host ?? read('WEB_END_HOST') ?? '127.0.0.1',
    keyFile: resolve(read('WEB_END_KEY_FILE') ?? join(dataDir, 'keys', 'master.key')),
    masterKey: read('WEB_END_MASTER_KEY'),
    port: Number(options.port ?? read('WEB_END_PORT') ?? 8799),
    publicUrl: options.publicUrl ?? read('WEB_END_PUBLIC_URL'),
    schedule: options.schedule ?? flag(read('WEB_END_SCHEDULE'), true),
    // The built-in builder. Off means the server only runs the site, like a published app with no editor.
    studio: options.studio ?? flag(read('WEB_END_STUDIO'), true),
    studioFile: join(dataDir, 'studio.sqlite'),
    // Test-only: lets a request say which visitor address it comes from, as wrangler dev does. Never on in production.
    testClientAddress: options.testClientAddress ?? false,
    testScheduled: options.testScheduled ?? flag(read('WEB_END_TEST_SCHEDULED'), false),
    // The engine asks GitHub for the newest release when the owner opens the back office. Off blocks it.
    updateCheck: options.updateCheck ?? !/^(0|false|no|off)$/i.test(String(read('WEB_END_UPDATE_CHECK') ?? 'on')),
    trustProxy: options.trustProxy ?? flag(read('WEB_END_TRUST_PROXY'), false),
  }
}
