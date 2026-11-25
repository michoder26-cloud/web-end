// A small CSS reader for copying an old site's look: it keeps the rules the page uses, finds the files they
// load (fonts, background photos) and writes them back compactly. It never runs anything.

export type CssNode = { kind: 'rule'; selector: string; body: string } | { kind: 'block'; prelude: string; children: CssNode[] } | { kind: 'raw'; text: string }

// At-rules whose body is a list of rules, such as @media. Others (@font-face, @keyframes) are kept whole.
const nestedAt = /^@(media|supports|layer|container|document|-moz-document|scope|starting-style)\b/i

/** Reads a style sheet into rules and blocks. Broken CSS never throws: whatever can't be read is left out. */
export function parseCss(source: string): CssNode[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '')
  let at = 0
  // Moves past a quoted string starting at `from`.
  const skipString = (from: number) => {
    const quote = text[from]
    let index = from + 1
    while (index < text.length && text[index] !== quote) index += text[index] === '\\' ? 2 : 1
    return index + 1
  }
  // The next { ; or } outside strings and brackets.
  const scan = () => {
    let depth = 0
    let index = at
    while (index < text.length) {
      const char = text[index]
      if (char === '"' || char === "'") { index = skipString(index); continue }
      if (char === '\\') { index += 2; continue }
      if (char === '(' || char === '[') depth++
      else if ((char === ')' || char === ']') && depth > 0) depth--
      else if (!depth && (char === '{' || char === ';' || char === '}')) return index
      index++
    }
    return index
  }
  // The } that closes the block whose body starts at `at`.
  const closing = () => {
    let depth = 1
    let index = at
    while (index < text.length) {
      const char = text[index]
      if (char === '"' || char === "'") { index = skipString(index); continue }
      if (char === '\\') { index += 2; continue }
      if (char === '{') depth++
      else if (char === '}' && !--depth) return index
      index++
    }
    return index
  }
  const list = (): CssNode[] => {
    const out: CssNode[] = []
    while (at < text.length) {
      while (at < text.length && /\s/.test(text[at])) at++
      if (at >= text.length) break
      if (text[at] === '}') { at++; return out }
      const stop = scan()
      const prelude = text.slice(at, stop).trim()
      if (stop >= text.length) { at = stop; break }
      if (text[stop] === ';') { at = stop + 1; if (prelude) out.push({ kind: 'raw', text: `${prelude};` }); continue }
      if (text[stop] === '}') { at = stop; continue }
      at = stop + 1
      if (nestedAt.test(prelude)) {
        out.push({ kind: 'block', prelude, children: list() })
        continue
      }
      const end = closing()
      const body = text.slice(at, end)
      at = end + 1
      if (prelude.startsWith('@')) out.push({ kind: 'raw', text: `${prelude}{${body}}` })
      else if (prelude) out.push({ kind: 'rule', selector: prelude, body })
    }
    return out
  }
  return list()
}

const squeeze = (value: string) => value.replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').trim()

export function writeCss(nodes: CssNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === 'rule') return `${squeeze(node.selector)}{${squeeze(node.body)}}`
      if (node.kind === 'raw') return squeeze(node.text)
      const inner = writeCss(node.children)
      return inner || /^@layer\b/i.test(node.prelude) ? `${squeeze(node.prelude)}{${inner}}` : ''
    })
    .join('')
}

/** A CSS name with its escapes undone, so `.md\:flex` reads as the class "md:flex". */
export function unescapeIdent(value: string) {
  return value.replace(/\\([0-9a-f]{1,6})\s?|\\(.)/gi, (_, hex: string | undefined, char: string | undefined) => (hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff) || 0xfffd) : char!))
}

const identPart = String.raw`(?:\\[0-9a-fA-F]{1,6}\s?|\\[^\n0-9a-fA-F]|[\w-]|[^\x00-\x7F])+`
const classToken = new RegExp(String.raw`\.(${identPart})`, 'g')
const idToken = new RegExp(String.raw`#(${identPart})`, 'g')

/** Splits "a, b:is(c, d)" at the commas that separate selectors. */
export function splitSelectors(selector: string) {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < selector.length; index++) {
    const char = selector[index]
    if (char === '\\') { index++; continue }
    if (char === '(' || char === '[') depth++
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1)
    else if (char === ',' && !depth) { parts.push(selector.slice(start, index)); start = index + 1 }
  }
  parts.push(selector.slice(start))
  return parts.map((part) => part.trim()).filter(Boolean)
}

export type Used = { attributes: Set<string>; classes: Set<string>; ids: Set<string> }

/** True unless the selector needs a class or id the page doesn't have. When unsure, it keeps the selector. */
export function selectorUsed(selector: string, used: Used) {
  let bare = selector
  // What's inside :not(), :is() and attribute brackets is never required.
  for (let round = 0; round < 6 && /[([]/.test(bare); round++) bare = bare.replace(/\([^()]*\)/g, '').replace(/\[[^[\]]*\]/g, '')
  for (const match of bare.matchAll(classToken)) if (!used.classes.has(unescapeIdent(match[1]))) return false
  for (const match of bare.matchAll(idToken)) {
    const name = unescapeIdent(match[1])
    // A colour such as #fff can't appear in a selector, but keep anything odd.
    if (!used.ids.has(name)) return false
  }
  return true
}

/** Keeps only the rules this page can use, and leaves out printing. */
export function keepUsed(nodes: CssNode[], used: Used): CssNode[] {
  const out: CssNode[] = []
  for (const node of nodes) {
    if (node.kind === 'rule') {
      const kept = splitSelectors(node.selector).filter((one) => selectorUsed(one, used))
      if (kept.length && node.body.trim()) out.push({ ...node, selector: kept.join(',') })
    } else if (node.kind === 'block') {
      if (/^@media\s+print\b/i.test(node.prelude)) continue
      const children = keepUsed(node.children, used)
      if (children.length || /^@layer\b/i.test(node.prelude)) out.push({ ...node, children })
    } else if (!/^@(charset|import|namespace)\b/i.test(node.text)) out.push(node)
  }
  return out
}

const fontFamilyOf = (text: string) => /font-family\s*:\s*(["']?)([^;"'}]+)\1/i.exec(text)?.[2]?.trim().toLowerCase() ?? ''
const keyframesName = (text: string) => /^@(?:-webkit-)?keyframes\s+(["']?)([^\s{"']+)\1/i.exec(text)?.[2] ?? ''

/** The declarations of every rule, to see which fonts and animations they name. */
export function ruleText(nodes: CssNode[]): string {
  return nodes.map((node) => (node.kind === 'rule' ? node.body : node.kind === 'block' ? ruleText(node.children) : '')).join(' ')
}

/** Drops fonts and animations nothing on the page uses, once the rules are known. */
export function dropUnusedFaces(nodes: CssNode[], extraText = ''): CssNode[] {
  const bodies: string[] = [extraText]
  const walk = (list: CssNode[]) => list.forEach((node) => (node.kind === 'rule' ? bodies.push(node.body) : node.kind === 'block' ? walk(node.children) : null))
  walk(nodes)
  const all = bodies.join(' ').toLowerCase()
  const keep = (list: CssNode[]): CssNode[] =>
    list.flatMap((node): CssNode[] => {
      if (node.kind === 'block') return [{ ...node, children: keep(node.children) }]
      if (node.kind !== 'raw') return [node]
      if (/^@font-face/i.test(node.text)) {
        const family = fontFamilyOf(node.text)
        return !family || all.includes(family) ? [node] : []
      }
      if (/^@(-webkit-)?keyframes/i.test(node.text)) {
        const name = keyframesName(node.text).toLowerCase()
        return !name || all.includes(name) ? [node] : []
      }
      return [node]
    })
  return keep(nodes)
}

const urlPattern = /url\(\s*(["']?)([^"')]*?)\1\s*\)/gi

/** Makes every url() absolute against the sheet's own address. */
export function absoluteUrls(css: string, base: string) {
  return css.replace(urlPattern, (match, _quote: string, value: string) => {
    const trimmed = value.trim()
    if (!trimmed || trimmed.startsWith('#') || /^data:/i.test(trimmed)) return match
    try {
      const target = new URL(trimmed, base)
      if (!/^https?:$/.test(target.protocol)) return 'url("")'
      return `url("${target.href.replace(/"/g, '%22')}")`
    } catch {
      return 'url("")'
    }
  })
}

/** The files a set of rules loads: fonts (the best format of each face) and photos. */
export function filesOf(nodes: CssNode[]) {
  const fonts: string[] = []
  const images: string[] = []
  const walk = (list: CssNode[]) => {
    for (const node of list) {
      if (node.kind === 'block') { walk(node.children); continue }
      const text = node.kind === 'rule' ? node.body : node.text
      const found = [...text.matchAll(urlPattern)].map((match) => match[2]).filter((value) => /^https?:/i.test(value))
      if (node.kind === 'raw' && /^@font-face/i.test(node.text)) {
        const formatted = [...text.matchAll(/url\(\s*(["']?)([^"')]*?)\1\s*\)\s*(?:format\(\s*["']?([\w-]+))?/gi)]
        const best = formatted.find((match) => /^https?:/i.test(match[2]) && (/^woff2/i.test(match[3] ?? '') || /\.woff2(\?|#|$)/i.test(match[2])))?.[2] ?? found[0]
        if (best) fonts.push(best)
      } else if (node.kind === 'rule') images.push(...found.filter((value) => !/\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(value)))
    }
  }
  walk(nodes)
  return { fonts: [...new Set(fonts)], images: [...new Set(images)] }
}

/** Every attribute name the rules check, such as data-state in [data-state=open]. */
export function attributesIn(nodes: CssNode[]) {
  const names = new Set<string>()
  const walk = (list: CssNode[]) => list.forEach((node) => {
    if (node.kind === 'block') walk(node.children)
    else if (node.kind === 'rule') for (const match of node.selector.matchAll(/\[\s*([\w:-]+)/g)) names.add(match[1].toLowerCase())
  })
  walk(nodes)
  return names
}
