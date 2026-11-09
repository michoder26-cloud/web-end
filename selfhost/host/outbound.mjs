// Every connection this server makes to another computer goes through here, so the owner can see
// exactly where it talks to (host names and counts only, never paths or contents), and can turn off
// the one connection the engine makes by itself: the check for a newer web-end release on GitHub.
const updateHosts = new Set(['raw.githubusercontent.com'])
const isLocal = (host) => host === 'localhost' || host.endsWith('.localhost') || host === 'studio.internal' || /^127\./.test(host) || host === '[::1]' || host === '::1'

let state = null

export function watchOutbound({ updateCheck = true } = {}) {
  if (state) {
    state.updateCheck = updateCheck
    return state.control
  }
  const original = globalThis.fetch
  state = { seen: new Map(), updateCheck }
  globalThis.fetch = async (input, init) => {
    let url
    try {
      url = new URL(input instanceof Request ? input.url : String(input))
    } catch {
      return original(input, init)
    }
    const host = url.hostname
    if (!isLocal(host)) {
      const purpose = updateHosts.has(host) && url.pathname.endsWith('/latest.json') ? 'update check' : 'set up by the owner'
      const key = `${host} (${purpose})`
      const entry = state.seen.get(key) ?? { blocked: 0, count: 0, host, purpose }
      state.seen.set(key, entry)
      if (purpose === 'update check' && !state.updateCheck) {
        entry.blocked++
        return new Response('Update checks are turned off on this server (WEB_END_UPDATE_CHECK=off).', { status: 503 })
      }
      entry.count++
    }
    return original(input, init)
  }
  state.control = {
    clear: () => state.seen.clear(),
    list: () => [...state.seen.values()].map((entry) => ({ ...entry })),
  }
  return state.control
}
