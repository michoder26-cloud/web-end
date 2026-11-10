// Check the real quota lookup and both progress renderers across UTC midnight.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const cloud = fileURLToPath(new URL('../../cloud/', import.meta.url))
const bundle = await build({
  stdin: { contents: "export { sentToday, daysToFinish, progressSentence } from './src/news.ts'; export { officeWords } from './src/office-words.ts'", resolveDir: cloud },
  bundle: true, format: 'esm', platform: 'node', write: false,
})
const { sentToday, daysToFinish, progressSentence, officeWords } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const counts = new Map([['2026-11-10', 4]])
const env = { DB: { prepare(sql) {
  assert.match(sql, /FROM news_daily/)
  return { bind(siteId, day) {
    assert.equal(siteId, 1)
    return { first: async () => counts.has(day) ? { sent: counts.get(day) } : null }
  } }
} } }
const progress = { failed: 0, inFlight: 0, left: 3, sent: 4, total: 7 }
for (const [time, expected] of [
  ['2026-11-10T23:59:59.999Z', '4 of 7 sent, the rest go out tomorrow.'],
  ['2026-11-11T00:00:00.000Z', '4 of 7 sent, the rest go out within the next hour or so.'],
]) {
  const used = await sentToday(env, 1, Date.parse(time))
  const leftToday = Math.max(0, 4 - used)
  assert.equal(progressSentence({ status: 'sending' }, progress, leftToday, 4), expected)
  assert.equal(officeWords('en').news.progress('sending', progress, daysToFinish(progress.left, leftToday, 4)), expected)
}
console.log('2 passed, 0 failed (news progress UTC boundary, both views)')
