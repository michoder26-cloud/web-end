// Bundles this repository's Cloudflare engine into one ES module that Node can load.
// Cloudflare-only pieces are not bundled: the host gives the engine a D1-shaped database and HTMLRewriter.
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cloud = join(root, '..', 'cloud')
mkdirSync(join(root, 'dist'), { recursive: true })
const result = await build({
  entryPoints: [join(cloud, 'src/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: join(root, 'dist/engine.mjs'),
  packages: 'external',
  sourcemap: true,
  logLevel: 'warning',
  metafile: true,
})
const engine = readFileSync(join(root, 'dist/engine.mjs'))
const info = {
  builtAt: new Date().toISOString(),
  engineSha256: createHash('sha256').update(engine).digest('hex'),
  inputs: Object.keys(result.metafile.inputs).length,
  version: JSON.parse(readFileSync(join(cloud, 'latest.json'), 'utf8')).version,
}
writeFileSync(join(root, 'dist/build-info.json'), `${JSON.stringify(info, null, 2)}\n`)
console.log(`Engine bundled: ${info.inputs} files, ${engine.length} bytes, sha256 ${info.engineSha256.slice(0, 16)}…`)
