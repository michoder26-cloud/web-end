// Fails if a secret would reach Git. Add --history to also scan every past commit.
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const self = fileURLToPath(import.meta.url)
const root = path.resolve(path.dirname(self), '../..')
const checkHistory = process.argv.includes('--history')

const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 * 512, stdio: ['ignore', 'pipe', 'ignore'] })

const forbiddenFile = /(^|\/)(\.env(\.(?!example$)[^/]+)?|\.dev\.vars|[^/]+\.pem|[^/]+\.key|id_rsa|id_ed25519)$/
const tokens = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI-style key', /\bsk-[A-Za-z0-9_-]{32,}/],
  ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Stripe live key', /\b[sr]k_live_[A-Za-z0-9]{16,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{20,}/],
  ['database URL with a password', /\b(postgres(ql)?|mysql|mongodb(\+srv)?):\/\/[^\s:'"/]+:[^\s@'"]+@/],
  ['Payload secret', /PAYLOAD_SECRET\s*=\s*['"]?(?!local-tests-only\b|ignore\b)[A-Za-z0-9+/_-]{8,}/],
]
const hardcoded = /\b(api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*['"][^'"\s]{12,}['"]/i
const skipContent = /(^|\/)(package-lock\.json|importMap\.js)$|\/migrations\/[^/]+\.json$|\.(png|jpe?g|webp|gif|ico|woff2?|ttf|pdf)$/i

const findings = []

const scanText = (label, file, text) => {
  text.split('\n').forEach((line, index) => {
    for (const [name, pattern] of tokens) {
      if (pattern.test(line)) findings.push(`${label}${file}:${index + 1} looks like a ${name}`)
    }
    if (hardcoded.test(line) && !/(^|\/)tests\//.test(file)) {
      findings.push(`${label}${file}:${index + 1} looks like a hard-coded secret`)
    }
  })
}

const files = git('ls-files', '-co', '--exclude-standard').split('\n').filter(Boolean)
for (const file of files) {
  const full = path.join(root, file)
  if (full === self) continue
  if (forbiddenFile.test(file)) {
    findings.push(`${file} must not be in Git`)
    continue
  }
  if (skipContent.test(file)) continue
  let stat
  try {
    stat = statSync(full)
  } catch {
    continue // Deleted in the working copy.
  }
  if (stat.size > 2 * 1024 * 1024) continue
  scanText('', file, readFileSync(full, 'utf8'))
  if (file.endsWith('.env.example') && /^[A-Z0-9_]+=\S+/m.test(readFileSync(full, 'utf8'))) {
    findings.push(`${file} must keep its values empty`)
  }
}

if (checkHistory) {
  const history = git('log', '--all', '-p', '--no-color', '--unified=0', '--format=commit %h')
  let commit = ''
  let file = ''
  history.split('\n').forEach((line) => {
    if (line.startsWith('commit ')) commit = line.slice(7)
    else if (line.startsWith('+++ b/')) {
      file = line.slice(6)
      if (forbiddenFile.test(file)) findings.push(`commit ${commit}: ${file} must not be in Git`)
    } else if (line.startsWith('+') && !line.startsWith('+++') && !skipContent.test(file) && file !== 'scripts/gates/secrets.mjs') {
      scanText(`commit ${commit}: `, file, line.slice(1))
    }
  })
}

if (findings.length) {
  console.error('Possible secrets found. The values are not shown here.')
  for (const finding of findings) console.error(`- ${finding}`)
  process.exit(1)
}
console.log(`No secrets found in ${files.length} files${checkHistory ? ' or in Git history' : ''}.`)
