// A small stand-in for Cloudflare's HTMLRewriter, for running the engine on Node.
// It supports what the engine uses: selectors made of a tag name (or *), optionally with [attr] or
// [attr="value"], joined by commas; element handlers (tagName, getAttribute, hasAttribute,
// onEndTag, prepend, append, before, after, setInnerContent, remove) and text handlers.
// It reads the whole body first (the engine already caps what it reads), then writes the result.

const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
const rawTextTags = new Set(['script', 'style', 'textarea', 'title'])

function parseSelector(text) {
  return text.split(',').map((part) => {
    const match = /^\s*([a-zA-Z][\w-]*|\*)?((?:\[[^\]]+\])*)\s*$/.exec(part)
    if (!match) throw new TypeError(`Unsupported selector: ${part}`)
    const attributes = [...match[2].matchAll(/\[\s*([\w:-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]/g)].map((found) => ({
      name: found[1].toLowerCase(),
      value: found[2] ?? found[3] ?? found[4],
    }))
    return { attributes, tag: (match[1] ?? '*').toLowerCase() }
  })
}

const matches = (selectors, tag, attributes) =>
  selectors.some((selector) => (selector.tag === '*' || selector.tag === tag) && selector.attributes.every((want) => attributes.has(want.name) && (want.value === undefined || attributes.get(want.name) === want.value)))

function readAttributes(text) {
  const attributes = new Map()
  for (const found of text.matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = found[1].toLowerCase()
    if (!attributes.has(name)) attributes.set(name, found[2] ?? found[3] ?? found[4] ?? '')
  }
  return attributes
}

const escapeText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

class ElementHandle {
  constructor(tag, attributes, edits, startIndex, endOfStartTag) {
    this.tagName = tag
    this.attributes = attributes
    this.edits = edits
    this.startIndex = startIndex
    this.endOfStartTag = endOfStartTag
    this.endTagHandlers = []
    this.removed = false
  }
  getAttribute(name) {
    return this.attributes.has(name.toLowerCase()) ? this.attributes.get(name.toLowerCase()) : null
  }
  hasAttribute(name) {
    return this.attributes.has(name.toLowerCase())
  }
  onEndTag(handler) {
    if (voidTags.has(this.tagName)) throw new TypeError('A void element has no end tag')
    this.endTagHandlers.push(handler)
  }
  content(text, options) {
    return options?.html ? text : escapeText(text)
  }
  before(text, options) {
    this.edits.push({ at: this.startIndex, text: this.content(text, options) })
    return this
  }
  prepend(text, options) {
    this.edits.push({ at: this.endOfStartTag, text: this.content(text, options) })
    return this
  }
  append(text, options) {
    this.appendText = (this.appendText ?? '') + this.content(text, options)
    return this
  }
  after(text, options) {
    this.afterText = (this.afterText ?? '') + this.content(text, options)
    return this
  }
  setInnerContent(text, options) {
    this.innerContent = this.content(text, options)
    return this
  }
  remove() {
    this.removed = true
    return this
  }
}

export class HTMLRewriter {
  constructor() {
    this.handlers = []
  }

  on(selector, handlers) {
    this.handlers.push({ handlers, selectors: parseSelector(selector) })
    return this
  }

  onDocument() {
    return this
  }

  transform(response) {
    const run = async () => {
      const source = await response.text()
      return this.rewrite(source)
    }
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(new TextEncoder().encode(await run()))
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })
    return new Response(stream, { headers: response.headers, status: response.status, statusText: response.statusText })
  }

  rewrite(html) {
    const edits = []
    const removals = []
    const open = [] // { tag, element, matched: [{ handlers }] }
    const textTo = (text, lastInTextNode) => {
      if (!text) return
      for (const entry of open) for (const handler of entry.matched) handler.text?.({ lastInTextNode, removed: false, text })
    }
    const closeTo = (index, endIndex, closingStart) => {
      // Closes every element above and including open[index].
      while (open.length > index) {
        const entry = open.pop()
        const element = entry.element
        if (element.appendText) edits.push({ at: closingStart, text: element.appendText })
        for (const handler of element.endTagHandlers) handler({ name: element.tagName })
        if (element.afterText) edits.push({ at: endIndex, text: element.afterText })
        if (element.innerContent !== undefined) removals.push({ from: element.endOfStartTag, to: closingStart, text: element.innerContent })
        if (element.removed) removals.push({ from: element.startIndex, to: endIndex, text: '' })
      }
    }

    let position = 0
    const tagPattern = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>|<\?[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g
    while (position < html.length) {
      tagPattern.lastIndex = position
      const found = tagPattern.exec(html)
      if (!found) {
        textTo(html.slice(position), true)
        break
      }
      textTo(html.slice(position, found.index), true)
      const end = found.index + found[0].length
      if (found[1]) {
        const tag = found[1].toLowerCase()
        const index = open.findLastIndex((entry) => entry.tag === tag)
        if (index > -1) closeTo(index, end, found.index)
        position = end
        continue
      }
      if (!found[2]) {
        position = end
        continue
      }
      const tag = found[2].toLowerCase()
      const attributes = readAttributes(found[3] ?? '')
      const element = new ElementHandle(tag, attributes, edits, found.index, end)
      const matched = this.handlers.filter((entry) => matches(entry.selectors, tag, attributes)).map((entry) => entry.handlers)
      for (const handler of matched) handler.element?.(element)
      const selfClosing = /\/\s*$/.test(found[3] ?? '')
      if (voidTags.has(tag) || selfClosing) {
        if (element.afterText) edits.push({ at: end, text: element.afterText })
        if (element.removed) removals.push({ from: found.index, to: end, text: '' })
        position = end
        continue
      }
      open.push({ element, matched, tag })
      if (rawTextTags.has(tag)) {
        const closing = new RegExp(`</${tag}\\s*>`, 'ig')
        closing.lastIndex = end
        const close = closing.exec(html)
        const textEnd = close ? close.index : html.length
        textTo(html.slice(end, textEnd), true)
        if (close) closeTo(open.length - 1, close.index + close[0].length, close.index)
        position = close ? close.index + close[0].length : html.length
        continue
      }
      position = end
    }
    closeTo(0, html.length, html.length)

    // Applies removals and insertions from the end, so earlier positions stay right.
    let output = html
    const changes = [...removals.map((removal) => ({ ...removal, kind: 'replace' })), ...edits.map((edit) => ({ from: edit.at, kind: 'insert', text: edit.text, to: edit.at }))]
    changes.sort((a, b) => b.from - a.from || (a.kind === 'insert' ? 1 : -1))
    for (const change of changes) output = output.slice(0, change.from) + change.text + output.slice(change.to)
    return output
  }
}
