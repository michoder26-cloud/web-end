// Copies only the Latin and Thai font files the site styles use, and writes one stylesheet for them.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const families = [
  'bricolage-grotesque',
  'fraunces',
  'fredoka',
  'inter',
  'manrope',
  'noto-sans-thai',
  'noto-sans-thai-looped',
  'noto-serif-thai',
  'nunito',
  'source-serif-4',
  'space-grotesk',
]
// Fonts with no variable version: only the weights pages use. Common on sites moved from site builders.
const fixed = { 'bai-jamjuree': [400, 500, 600, 700], 'ibm-plex-sans-thai': [400, 500, 600, 700] }
const wanted = /-(latin|latin-ext|thai)-[\w-]*normal$/
const out = 'public/fonts'
mkdirSync(out, { recursive: true })

let css = ''
for (const family of families) {
  const dir = `node_modules/@fontsource-variable/${family}`
  const source = readFileSync(`${dir}/index.css`, 'utf8')
  for (const [, subset, face] of source.matchAll(/\/\* ([\w-]+) \*\/\s*(@font-face\s*\{[^}]*\})/g)) {
    if (!wanted.test(subset)) continue
    const file = face.match(/url\(\.\/files\/([^)]+\.woff2)\)/)?.[1]
    if (!file) continue
    copyFileSync(`${dir}/files/${file}`, `${out}/${file}`)
    css += `${face.replace(/url\(\.\/files\/[^)]+\)/, `url(/fonts/${file})`)}\n`
  }
}
for (const [family, weights] of Object.entries(fixed)) {
  const dir = `node_modules/@fontsource/${family}`
  for (const weight of weights) {
    const source = readFileSync(`${dir}/${weight}.css`, 'utf8')
    for (const [, subset, face] of source.matchAll(/\/\* ([\w-]+) \*\/\s*(@font-face\s*\{[^}]*\})/g)) {
      if (!wanted.test(subset.slice(family.length))) continue
      const file = face.match(/url\(\.\/files\/([^)]+\.woff2)\)/)?.[1]
      if (!file) continue
      copyFileSync(`${dir}/files/${file}`, `${out}/${file}`)
      css += `${face.replace(/src:[^;]+;/, `src: url(/fonts/${file}) format('woff2');`)}
`
    }
  }
}
writeFileSync(`${out}/fonts.css`, css)
console.log(`Wrote ${css.match(/@font-face/g)?.length ?? 0} font faces.`)
