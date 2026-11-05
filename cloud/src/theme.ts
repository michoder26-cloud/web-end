export const siteStyles = ['studio', 'editorial', 'warm', 'bold', 'calm'] as const

const sans = "'Noto Sans Thai Variable', sans-serif"
const serif = "'Noto Serif Thai Variable', serif"

/** The fonts every site carries, each with a Thai font that suits it. */
export const siteFonts = {
  'Bricolage Grotesque': `'Bricolage Grotesque Variable', ${sans}`,
  Fraunces: `'Fraunces Variable', ${serif}`,
  Fredoka: `'Fredoka Variable', ${sans}`,
  Inter: `'Inter Variable', ${sans}`,
  Manrope: `'Manrope Variable', ${sans}`,
  Nunito: `'Nunito Variable', ${sans}`,
  'Source Serif 4': `'Source Serif 4 Variable', ${serif}`,
  'Space Grotesk': `'Space Grotesk Variable', ${sans}`,
} as const

export const siteFontNames = Object.keys(siteFonts) as [keyof typeof siteFonts, ...(keyof typeof siteFonts)[]]

export const fontVars = (heading: unknown, body: unknown) => {
  const stack = (name: unknown) => (typeof name === 'string' && Object.hasOwn(siteFonts, name) ? siteFonts[name as keyof typeof siteFonts] : '')
  return `${stack(heading) ? `--display:${stack(heading)};` : ''}${stack(body) ? `--body:${stack(body)};` : ''}`
}

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)

export const isSafeHref = (value: unknown): value is string =>
  typeof value === 'string' && /^(\/(?!\/)|#|\?|https:\/\/|mailto:|tel:)/.test(value)

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const contrast = (first: string, second: string) => {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (light + 0.05) / (dark + 0.05)
}

export const readableOn = (color: string) =>
  contrast(color, '#ffffff') >= contrast(color, '#111111') ? '#ffffff' : '#111111'
