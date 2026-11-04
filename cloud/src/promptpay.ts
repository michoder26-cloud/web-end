// PromptPay, Thailand's national payment scheme. Customers scan a QR code with any Thai banking app,
// which fills in the shop's PromptPay ID and the exact amount. The code follows the EMVCo merchant QR format
// with the Thai QR Payment fields. Nothing here talks to a bank: the owner still checks that the money arrived.
// This file imports nothing, so tests can load it directly.

export type PromptPayKind = 'mobile' | 'id' | 'ewallet'

/** Thai national ID and tax ID numbers end with a check digit, so a mistyped number is caught before customers pay it. */
export function validThaiId(digits: string) {
  if (!/^\d{13}$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (13 - i)
  return (11 - (sum % 11)) % 10 === Number(digits[12])
}

/**
 * Reads what the owner typed: a mobile number (10 digits starting with 0), a 13-digit national ID or tax ID,
 * or a 15-digit e-wallet ID. Spaces and dashes are allowed, as people write them. Null if it can't be one of those.
 */
export function readPromptPayId(value: unknown): { digits: string; kind: PromptPayKind } | null {
  if (typeof value !== 'string') return null
  const digits = value.replace(/[\s-]/g, '')
  if (/^0\d{9}$/.test(digits)) return { digits, kind: 'mobile' }
  if (/^\d{13}$/.test(digits)) return validThaiId(digits) ? { digits, kind: 'id' } : null
  if (/^\d{15}$/.test(digits)) return { digits, kind: 'ewallet' }
  return null
}

export const validPromptPayId = (value: unknown) => readPromptPayId(value) !== null

/** CRC-16/CCITT-FALSE: polynomial 0x1021, starting at 0xFFFF, as the EMVCo QR format asks. Four capital hex digits. */
export function crc16(text: string) {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// Each field is its two-digit tag, its two-digit length, then the value.
const field = (tag: string, value: string) => `${tag}${String(value.length).padStart(2, '0')}${value}`

// The amount field holds at most 13 characters, such as 9999999999.99.
export const maxPromptPayAmount = 999_999_999_999

/** Whether an order total, in satang, can go in a PromptPay code. */
export const promptPayAmountOk = (amount: number) => Number.isSafeInteger(amount) && amount > 0 && amount <= maxPromptPayAmount

/** Baht with exactly two decimals, such as 1290.00, from satang. */
export const promptPayAmount = (amount: number) => `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, '0')}`

/**
 * The text inside a PromptPay QR code for one payment. The amount is in satang, the way orders store it.
 * Tag 01 is 12 because the code carries an amount and is meant for this one order.
 */
export function promptPayPayload(id: string, amount: number) {
  const target = readPromptPayId(id)
  if (!target || !promptPayAmountOk(amount)) return null
  // A mobile number goes in as 0066 and the number without its first 0, 13 digits in all.
  const account =
    target.kind === 'mobile' ? field('01', `0066${target.digits.slice(1)}`) : target.kind === 'id' ? field('02', target.digits) : field('03', target.digits)
  const body = [
    field('00', '01'),
    field('01', '12'),
    field('29', field('00', 'A000000677010111') + account),
    field('53', '764'),
    field('54', promptPayAmount(amount)),
    field('58', 'TH'),
  ].join('')
  // The check covers everything before it, including the CRC field's own tag and length.
  return `${body}6304${crc16(`${body}6304`)}`
}
