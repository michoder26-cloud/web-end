export const siteStyles = ['studio', 'editorial', 'warm', 'bold', 'calm'] as const

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
