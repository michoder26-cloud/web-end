// Tests the chat notification messages. Usage: node --experimental-strip-types tests/notify.mjs
import { chatMessage, hiddenUrl, isChatUrl } from '../src/webhooks.ts'

let failed = 0
const check = (ok, name) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`)
  if (!ok) failed++
}

check(isChatUrl('https://discord.com/api/webhooks/1/abc') && isChatUrl('https://hooks.slack.com/services/a/b/c') && isChatUrl('https://api.telegram.org/botabc/sendMessage?chat_id=1'), 'recognises chat addresses')
check(!isChatUrl('https://example.com/hook') && !isChatUrl('https://discord.com.evil.test/hook') && !isChatUrl('not a link'), 'leaves other addresses alone')
check(hiddenUrl('https://discord.com/api/webhooks/1/abc') === 'https://discord.com/…' && hiddenUrl('https://example.com/hook') === 'https://example.com/hook', 'hides only the chat secrets')
const order = chatMessage('order.created', { address: '1 Secret Road', email: 'a@example.test', id: 12, lines: [{ title: 'Mug' }], name: 'Alice', note: 'Ring twice', phone: '0812345678', status: 'pending', total: 10000 })
check(order.startsWith('New order') && order.includes('id: 12') && order.includes('total: 10000'), 'an order message says what happened')
check(!order.includes('Secret Road') && !order.includes('0812345678') && !order.includes('a@example.test') && !order.includes('Ring twice'), 'an order message leaves private details in the back office')
const record = chatMessage('record.created', { record: { created_at: 'x', customer_id: 3, id: 4, title: 'Yoga' }, table: 'bookings' })
check(record.startsWith('New record (bookings)') && record.includes('title: Yoga') && !record.includes('customer_id'), 'a record message names the table and its fields')
check(chatMessage('record.created', { record: { body: 'x'.repeat(5000) }, table: 't' }).length <= 1500, 'a message stays within chat limits')

console.log(failed ? `\n${failed} checks failed.` : '\nAll checks passed.')
process.exit(failed ? 1 : 0)
