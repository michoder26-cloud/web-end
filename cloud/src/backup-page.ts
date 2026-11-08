import { backupFormat } from './backup'
import { escapeHtml } from './http'
import type { OfficeWords } from './office-words'

/** The System page's backup card. The buttons only work with the script below; without it, the page says so. */
export const backupCard = (base: string, t: OfficeWords) => {
  const b = t.backup
  const words = JSON.stringify({ confirmFirst: b.confirmFirst, done: b.done, failed: b.failed, notBackup: b.notBackup, open: b.open, reading: b.reading, safety: b.safety, saved: b.saved, writing: b.writing })
  return `<article class="card account__record backup" data-base="${escapeHtml(base)}" data-format="${backupFormat}" data-words="${escapeHtml(words)}" id="backup"><h2>${b.heading}</h2><p>${b.help}</p>
<p class="backup__no-script" role="note">${b.needsScript}</p>
<p><button class="button button--small" data-backup-download disabled type="button">${b.download}</button></p>
<h3>${b.restoreHeading}</h3><p>${b.restoreHelp}</p>
<form class="contact-form" data-backup-restore><label>${b.file}<input accept=".json,application/json" name="file" required type="file"></label><label class="check"><input name="confirm" required type="checkbox"> ${b.confirm}</label><button class="button button--small" disabled type="submit">${b.restore}</button></form>
<p aria-live="polite" class="backup__status" data-backup-status role="status"></p></article>`
}

// Runs in the owner's browser. It reads the backup in small parts and saves one file, and restores it the same way.
export const backupScript = `(() => {
  const box = document.getElementById('backup')
  if (!box) return
  const base = box.dataset.base
  const words = JSON.parse(box.dataset.words)
  const status = box.querySelector('[data-backup-status]')
  const fill = (text, values) => text.replace(/\\{(\\w+)\\}/g, (_, key) => values[key] ?? '')
  const say = (text, values = {}) => { status.textContent = fill(text, values) }
  box.querySelector('.backup__no-script').hidden = true
  for (const button of box.querySelectorAll('button')) button.disabled = false

  const ask = async (path, options) => {
    const response = await fetch(base + path, { credentials: 'same-origin', ...options })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.problem || response.status)
    return body
  }
  const makeBackup = async () => {
    const head = await ask('/backup/part?table=site')
    const backup = { app: 'web-end', appVersion: head.appVersion, createdAt: new Date().toISOString(), format: head.format, site: head.site, tables: {} }
    for (const table of head.tables) {
      const part = { columns: [], rows: [] }
      let after = 0
      for (;;) {
        const page = await ask('/backup/part?table=' + table + '&after=' + after)
        part.columns = page.columns
        part.rows.push(...page.rows)
        say(words.reading, { n: part.rows.length, table })
        if (page.next === null) break
        after = page.next
      }
      backup.tables[table] = part
    }
    return backup
  }
  const save = (backup, name) => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }))
    link.download = name
    document.body.append(link)
    link.click()
    link.remove()
    say(words.saved, { file: name })
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')
  const busy = (on) => { for (const button of box.querySelectorAll('button')) button.disabled = on }

  box.querySelector('[data-backup-download]').addEventListener('click', async () => {
    busy(true)
    try {
      save(await makeBackup(), 'web-end-backup-' + stamp() + '.json')
    } catch (error) {
      say(words.failed, { problem: error.message })
    }
    busy(false)
  })

  box.querySelector('[data-backup-restore]').addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.target
    const file = form.file.files[0]
    if (!file || !form.confirm.checked) return say(words.confirmFirst)
    busy(true)
    try {
      let backup
      try {
        backup = JSON.parse(await file.text())
      } catch {
        throw new Error(words.notBackup)
      }
      if (backup.app !== 'web-end' || !backup.tables || !backup.site) throw new Error(words.notBackup)
      say(words.safety)
      save(await makeBackup(), 'web-end-before-restore-' + stamp() + '.json')
      const post = (body, token) => ask('/restore/part', { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Restore-Token': token } : {}) }, method: 'POST' })
      // Asked before starting: once the accounts are replaced, an owner signed in with an account can only send the restore's parts.
      const order = (await ask('/backup/part?table=site')).tables
      const { token } = await post({ confirm: true, format: backup.format, start: true })
      for (const table of order) {
        const part = backup.tables[table]
        if (!part || !part.rows.length) continue
        // Parts stay small, so each request is quick and under the size limit.
        let chunk = []
        let size = 0
        let done = 0
        const send = async () => {
          if (!chunk.length) return
          await post({ columns: part.columns, rows: chunk, table }, token)
          done += chunk.length
          say(words.writing, { n: done, table })
          chunk = []
          size = 0
        }
        for (const row of part.rows) {
          const length = JSON.stringify(row).length
          if (chunk.length && (size + length > 1500000 || chunk.length >= 200)) await send()
          chunk.push(row)
          size += length
        }
        await send()
      }
      await post({ finish: true, site: backup.site }, token)
      status.innerHTML = ''
      status.append(words.done + ' ')
      const link = document.createElement('a')
      link.href = base
      link.textContent = words.open
      status.append(link)
    } catch (error) {
      say(words.failed, { problem: error.message })
    }
    busy(false)
  })
})()`
