// Runs before Claude's tools. Protects secrets, blocks dangerous commands and keeps each
// team member to their own files. See scripts/gates/test-gates.mjs for the expected behaviour.
import { readFileSync } from 'node:fs'

const owned = {
  'product-architect': [/(^|\/)docs\/spec\//],
  'ui-frontend': [/(^|\/)src\/app\/\(frontend\)\//, /(^|\/)src\/components\//, /(^|\/)src\/blocks\//, /(^|\/)public\//],
  'backend-security': [
    /(^|\/)src\/collections\//,
    /(^|\/)src\/globals\//,
    /(^|\/)src\/access\//,
    /(^|\/)src\/hooks\//,
    /(^|\/)src\/migrations\//,
    /(^|\/)src\/payload\.config\.ts$/,
    /(^|\/)src\/payload-types\.ts$/,
    /(^|\/)src\/app\/\(payload\)\/admin\/importMap\.js$/,
  ],
  integrator: [/(^|\/)src\/lib\//, /(^|\/)src\/mcp\//, /(^|\/)src\/app\/api\//, /(^|\/)src\/app\/\(frontend\)\/.*actions\.ts$/],
  'qa-reviewer': [/(^|\/)tests\//, /(^|\/)playwright\.config\.ts$/],
  devops: [
    /(^|\/)wrangler\.jsonc$/,
    /(^|\/)open-next\.config\.ts$/,
    /(^|\/)next\.config\.ts$/,
    /(^|\/)cloudflare-env\.d\.ts$/,
    /(^|\/)package(-lock)?\.json$/,
    /(^|\/)\.github\//,
  ],
}
const everyone = [/(^|\/)docs\/handoff\//]

const secretFile = /(^|[\\/])(\.env(\.(?!example$)[^\\/]+)?|\.dev\.vars)$/
const secretInCommand = /(^|[\s"'=/\\<>])(\.env(\.(?!example\b)[\w.-]+)?|\.dev\.vars)(?![\w.-])/
const readsFiles = /\b(cat|type|more|less|head|tail|grep|rg|sed|awk|cp|copy|mv|move|scp|curl|base64|Get-Content|gc|Select-String|Copy-Item|Move-Item)\b/i
const dumpsEnv = /(^|[;&|]\s*)(printenv|env|set)\s*($|[;&|])|\bGet-ChildItem\s+env:|\bgci\s+env:/i
const secretValue = /\$\{?(env:)?(PAYLOAD_SECRET|CLOUDFLARE_API_TOKEN)\}?/i

const dangerous = [
  [/\bgit\s+push\b[^;&|]*(\s-f\b|--force)/, 'A forced push can erase work on GitHub.'],
  [/\bgit\s+reset\s+--hard\b|\bgit\s+clean\s+-[a-z]*f/, 'This throws away work that may not be saved.'],
  [/--no-verify\b|core\.hooksPath/, 'The secret checks must stay on.'],
  [/\b(curl|wget|irm|iwr|Invoke-WebRequest|Invoke-RestMethod)\b[^;&]*\|\s*(sudo\s+)?(sh|bash|zsh|iex|Invoke-Expression|node|python)\b/i, 'Do not run scripts straight from the internet.'],
  [/\bwrangler\s+(delete|d1\s+delete|r2\s+bucket\s+delete|kv\s+namespace\s+delete)\b/, 'Deleting live resources is for the site owner to do.'],
  [/\b(DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM)\b/i, 'Direct database deletes are for the site owner to approve.'],
  [/\bgit\s+push\b[^;&|]*\s\+\S/, 'A forced push can erase work on GitHub.'],
  [/\b(npm\s+publish|gh\s+repo\s+delete|gh\s+repo\s+edit)\b/, 'This changes something public.'],
  [/\b(Remove-Item|rm)\b(?=[^;&|]*\s(-[a-zA-Z]*r[a-zA-Z]*|-Recurse)\b)(?![^;&|]*(\.next|\.open-next|\.gates-db|test-results|playwright-report)\b)/i, 'Only generated folders may be removed in bulk.'],
]
const deployOnly = /\bgit\s+push\b|\bwrangler\s+(deploy|versions\s+deploy|secret|d1\s+migrations\s+apply)\b|\bopennextjs-cloudflare\s+deploy\b|\bnpm\s+run\s+deploy\b/

const deny = (reason) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  )
  process.exit(0)
}

const input = JSON.parse(readFileSync(0, 'utf8'))
const { agent_type: agent, tool_input: toolInput = {}, tool_name: tool } = input

if (tool === 'Bash' || tool === 'PowerShell') {
  const command = toolInput.command || ''
  if ((secretInCommand.test(command) && readsFiles.test(command)) || dumpsEnv.test(command) || secretValue.test(command)) {
    deny('Secrets stay out of the conversation. Use them by name only, and never print them.')
  }
  for (const [pattern, reason] of dangerous) {
    if (pattern.test(command)) deny(`${reason} Ask the site owner to do this.`)
  }
  if (agent && agent !== 'devops' && owned[agent] && deployOnly.test(command)) {
    deny('Only the devops role publishes or deploys.')
  }
} else {
  const file = (toolInput.file_path || toolInput.notebook_path || '').replaceAll('\\', '/')
  if (secretFile.test(file)) deny('Secret files stay private and are never read or edited here.')
  if (tool !== 'Read' && owned[agent]) {
    const allowed = [...owned[agent], ...everyone].some((pattern) => pattern.test(file))
    if (!allowed) deny(`${agent} does not own ${file}. Write a note in docs/handoff/ for the role that does.`)
  }
}
