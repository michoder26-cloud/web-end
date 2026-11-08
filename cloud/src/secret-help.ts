import { escapeHtml } from './http'
import type { OfficeWords } from './office-words'

/**
 * Where the owner adds a secret in Cloudflare. On a workers.dev address the Worker's name is the first part of the host,
 * so the link opens that Worker's settings directly. On the owner's own domain it opens the list of Workers instead.
 */
export const secretsUrl = (host: string) => {
  const worker = /^([a-z0-9-]{1,63})\.[a-z0-9-]+\.workers\.dev$/i.exec(host)?.[1]
  return worker ? `https://dash.cloudflare.com/?to=/:account/workers/services/view/${encodeURIComponent(worker)}/production/settings` : 'https://dash.cloudflare.com/?to=/:account/workers-and-pages'
}

/** A link to the right Cloudflare page and each secret's exact name, ready to select and copy. */
export const secretsHelp = (host: string, names: string[], t: OfficeWords) =>
  `<div class="secret-help"><p><a class="button button--small button--ghost" href="${escapeHtml(secretsUrl(host))}" rel="noopener noreferrer" target="_blank">${t.secrets.open} ↗</a></p><p><small>${t.secrets.how}</small></p>${names.map((name) => `<label>${t.secrets.name}<input class="secret-help__name" readonly value="${escapeHtml(name)}"></label>`).join('')}</div>`
