const pricePattern = /^(\D*?)(\d[\d,]*(?:\.\d{1,2})?)(\D*)$/

/** Reads a price such as "฿1,290" or "12.50 EUR". Amounts are whole cents, so sums stay exact. */
export function parsePrice(text: unknown) {
  const match = typeof text === 'string' ? pricePattern.exec(text.trim()) : null
  if (!match) return null
  const amount = Math.round(Number(match[2].replaceAll(',', '')) * 100)
  if (!Number.isSafeInteger(amount) || amount <= 0) return null
  return { amount, prefix: match[1], suffix: match[3] }
}

export const formatMoney = (amount: number, prefix: string, suffix: string) =>
  `${prefix}${(amount / 100).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: amount % 100 ? 2 : 0 })}${suffix}`
