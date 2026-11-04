// A small QR code maker for payment codes, drawn on the server as SVG, so pages need no scripts and no outside service.
// It follows ISO/IEC 18004: byte mode, error correction level M (about 15% of the code can be damaged and still scan),
// versions 1 to 10, which hold up to 213 bytes. A PromptPay code is under 100. This file imports nothing, so tests can load it directly.

// Level M, per version: error correction codewords per block, then [blocks, data codewords per block] groups.
const levelM: { ec: number; groups: [number, number][] }[] = [
  { ec: 10, groups: [[1, 16]] },
  { ec: 16, groups: [[1, 28]] },
  { ec: 26, groups: [[1, 44]] },
  { ec: 18, groups: [[2, 32]] },
  { ec: 24, groups: [[2, 43]] },
  { ec: 16, groups: [[4, 27]] },
  { ec: 18, groups: [[4, 31]] },
  { ec: 22, groups: [[2, 38], [2, 39]] },
  { ec: 22, groups: [[3, 36], [2, 37]] },
  { ec: 26, groups: [[4, 43], [1, 44]] },
]
const alignment = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]]
export const maxVersion = levelM.length

const dataCapacity = (version: number) => levelM[version - 1].groups.reduce((sum, [count, size]) => sum + count * size, 0)

// Reed-Solomon over GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
const exp = new Uint8Array(512)
const log = new Uint8Array(256)
for (let i = 0, x = 1; i < 255; i++, x = x & 0x80 ? ((x << 1) ^ 0x11d) & 0xff : x << 1) {
  exp[i] = x
  log[x] = i
}
for (let i = 255; i < 512; i++) exp[i] = exp[i - 255]
const multiply = (a: number, b: number) => (a && b ? exp[log[a] + log[b]] : 0)

function errorCodewords(data: number[], count: number) {
  // The generator is (x - a^0)(x - a^1)...(x - a^(count-1)), highest power first.
  let generator = [1]
  for (let i = 0; i < count; i++) {
    const next = new Array(generator.length + 1).fill(0)
    generator.forEach((coefficient, j) => {
      next[j] ^= coefficient
      next[j + 1] ^= multiply(coefficient, exp[i])
    })
    generator = next
  }
  const remainder = [...data, ...new Array(count).fill(0)]
  for (let i = 0; i < data.length; i++) {
    const factor = remainder[i]
    if (factor) for (let j = 1; j < generator.length; j++) remainder[i + j] ^= multiply(generator[j], factor)
  }
  return remainder.slice(data.length)
}

/** The codewords in the order they are placed: data blocks interleaved, then their error correction interleaved. */
function codewords(bytes: Uint8Array, version: number) {
  const bits: number[] = []
  const put = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
  }
  put(0b0100, 4) // byte mode
  put(bytes.length, version < 10 ? 8 : 16)
  for (const byte of bytes) put(byte, 8)
  const capacity = dataCapacity(version) * 8
  put(0, Math.min(4, capacity - bits.length)) // terminator
  while (bits.length % 8) bits.push(0)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0))
  for (let pad = 0xec; data.length < capacity / 8; pad ^= 0xec ^ 0x11) data.push(pad)

  const { ec: ecCount, groups } = levelM[version - 1]
  const blocks: number[][] = []
  let offset = 0
  for (const [count, size] of groups) for (let i = 0; i < count; i++, offset += size) blocks.push(data.slice(offset, offset + size))
  const errors = blocks.map((block) => errorCodewords(block, ecCount))
  const result: number[] = []
  for (let i = 0; i < Math.max(...blocks.map((block) => block.length)); i++) for (const block of blocks) if (i < block.length) result.push(block[i])
  for (let i = 0; i < ecCount; i++) for (const error of errors) result.push(error[i])
  return result
}

// BCH codes protect the format and version information, so a scanner can read them even when a little is damaged.
const bch = (value: number, generator: number, length: number) => {
  let remainder = value << (length - 1)
  for (let bit = 31 - Math.clz32(remainder); bit >= length - 1; bit--) if ((remainder >>> bit) & 1) remainder ^= generator << (bit - length + 1)
  return (value << (length - 1)) | remainder
}

const masks: ((row: number, column: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
]

class Grid {
  dark: boolean[][]
  reserved: boolean[][]
  size: number
  // Plain fields, not constructor shorthand, so Node can load this file with type stripping alone.
  constructor(size: number) {
    this.size = size
    this.dark = Array.from({ length: size }, () => new Array(size).fill(false))
    this.reserved = Array.from({ length: size }, () => new Array(size).fill(false))
  }
  set(row: number, column: number, dark: boolean) {
    if (row < 0 || column < 0 || row >= this.size || column >= this.size) return
    this.dark[row][column] = dark
    this.reserved[row][column] = true
  }
}

function functionPatterns(grid: Grid, version: number) {
  const { size } = grid
  // Finders in three corners, each with a light separator around it.
  for (const [top, left] of [[0, 0], [0, size - 7], [size - 7, 0]])
    for (let r = -1; r <= 7; r++)
      for (let c = -1; c <= 7; c++) {
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3))
        grid.set(top + r, left + c, ring !== 2 && ring !== 4)
      }
  for (let i = 8; i < size - 8; i++) {
    grid.set(6, i, i % 2 === 0)
    grid.set(i, 6, i % 2 === 0)
  }
  const centres = alignment[version - 1]
  for (const row of centres)
    for (const column of centres) {
      // Skip the three that would sit on a finder.
      if ((row === 6 && column === 6) || (row === 6 && column === size - 7) || (row === size - 7 && column === 6)) continue
      for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) grid.set(row + r, column + c, Math.max(Math.abs(r), Math.abs(c)) !== 1)
    }
  // Reserve the format areas now; their real bits go in after the mask is chosen.
  formatBits(grid, 0)
  grid.set(size - 8, 8, true) // the dark module
  if (version >= 7) {
    const info = bch(version, 0x1f25, 13)
    for (let i = 0; i < 18; i++) {
      const bit = ((info >>> i) & 1) === 1
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      grid.set(b, a, bit)
      grid.set(a, b, bit)
    }
  }
}

function formatBits(grid: Grid, mask: number) {
  // Level M is 00, so the five data bits are just the mask number.
  const info = bch(mask, 0x537, 11) ^ 0x5412
  const bit = (i: number) => ((info >>> i) & 1) === 1
  const { size } = grid
  for (let i = 0; i <= 5; i++) grid.set(i, 8, bit(i))
  grid.set(7, 8, bit(6))
  grid.set(8, 8, bit(7))
  grid.set(8, 7, bit(8))
  for (let i = 9; i < 15; i++) grid.set(8, 14 - i, bit(i))
  for (let i = 0; i < 8; i++) grid.set(8, size - 1 - i, bit(i))
  for (let i = 8; i < 15; i++) grid.set(size - 15 + i, 8, bit(i))
}

function placeData(grid: Grid, data: number[]) {
  const { size } = grid
  let index = 0
  // Two columns at a time from the right, going up then down, skipping the vertical timing column.
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let step = 0; step < size; step++) {
      for (let j = 0; j < 2; j++) {
        const column = right - j
        const upward = ((right + 1) & 2) === 0
        const row = upward ? size - 1 - step : step
        if (grid.reserved[row][column]) continue
        // Modules left over after the last codeword stay light, as the standard's remainder bits.
        if (index < data.length * 8) grid.dark[row][column] = ((data[index >>> 3] >>> (7 - (index & 7))) & 1) === 1
        index++
      }
    }
  }
}

/** The standard's penalty score: lower means fewer patterns that could confuse a scanner. */
function penalty(dark: boolean[][]) {
  const size = dark.length
  let score = 0
  const line = (get: (i: number) => boolean) => {
    let run = 1
    for (let i = 1; i <= size; i++) {
      if (i < size && get(i) === get(i - 1)) run++
      else {
        if (run >= 5) score += run - 2
        run = 1
      }
    }
    // Finder-like 1:1:3:1:1 runs with four light modules on one side.
    for (let i = 0; i + 10 < size + 4; i++) {
      const at = (k: number) => (k >= 0 && k < size ? get(k) : false)
      const core = at(i) && !at(i + 1) && at(i + 2) && at(i + 3) && at(i + 4) && !at(i + 5) && at(i + 6)
      if (!core) continue
      if (!at(i - 1) && !at(i - 2) && !at(i - 3) && !at(i - 4)) score += 40
      if (!at(i + 7) && !at(i + 8) && !at(i + 9) && !at(i + 10)) score += 40
    }
  }
  for (let r = 0; r < size; r++) line((c) => dark[r][c])
  for (let c = 0; c < size; c++) line((r) => dark[r][c])
  let total = 0
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      if (dark[r][c]) total++
      if (r + 1 < size && c + 1 < size && dark[r][c] === dark[r][c + 1] && dark[r][c] === dark[r + 1][c] && dark[r][c] === dark[r + 1][c + 1]) score += 3
    }
  score += Math.floor(Math.abs(total * 20 - size * size * 10) / (size * size)) * 10
  return score
}

/** Makes the QR code for some text, as rows of dark (true) and light modules, without the quiet zone. Null if it is too long. */
export function qrModules(text: string, options: { mask?: number; version?: number } = {}) {
  const bytes = new TextEncoder().encode(text)
  const version = options.version ?? Array.from({ length: maxVersion }, (_, i) => i + 1).find((v) => bytes.length <= dataCapacity(v) - (v < 10 ? 2 : 3))
  if (!version || version > maxVersion || bytes.length > dataCapacity(version) - (version < 10 ? 2 : 3)) return null
  const base = new Grid(version * 4 + 17)
  functionPatterns(base, version)
  placeData(base, codewords(bytes, version))
  let best: { dark: boolean[][]; score: number } | null = null
  for (let mask = 0; mask < masks.length; mask++) {
    if (options.mask !== undefined && mask !== options.mask) continue
    const grid = new Grid(base.size)
    grid.dark = base.dark.map((row, r) => row.map((dark, c) => (base.reserved[r][c] ? dark : dark !== masks[mask](r, c))))
    grid.reserved = base.reserved
    formatBits(grid, mask)
    const score = penalty(grid.dark)
    if (!best || score < best.score) best = { dark: grid.dark, score }
  }
  return best!.dark
}

/** The QR code as an SVG drawing, with the light border scanners need. One path, so it stays small and sharp at any size. */
export function qrSvg(text: string, label: string) {
  const modules = qrModules(text)
  if (!modules) return ''
  const quiet = 4
  const size = modules.length + quiet * 2
  let path = ''
  modules.forEach((row, r) => row.forEach((dark, c) => (path += dark ? `M${c + quiet} ${r + quiet}h1v1h-1z` : '')))
  const safe = label.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${safe}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path fill="#000" d="${path}"/></svg>`
}
