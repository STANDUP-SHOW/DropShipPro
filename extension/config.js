/**
 * Where the DropShip Pro API lives.
 *
 * Kept in chrome.storage rather than hard-coded so the same extension build works
 * against a local dev server and against the deployed backend: the user sets it
 * once in the popup. Falls back to localhost for a fresh install.
 */
const DEFAULT_API = 'http://localhost:4000'

async function getApiBase() {
  const { apiBase } = await chrome.storage.local.get('apiBase')
  return (apiBase || DEFAULT_API).replace(/\/$/, '')
}

async function setApiBase(url) {
  await chrome.storage.local.set({ apiBase: url.replace(/\/$/, '') })
}

const DEFAULT_APP = 'http://localhost:5173'

async function getAppUrl() {
  const { appUrl } = await chrome.storage.local.get('appUrl')
  return (appUrl || DEFAULT_APP).replace(/\/$/, '')
}

async function setAppUrl(url) {
  await chrome.storage.local.set({ appUrl: url.replace(/\/$/, '') })
}

/**
 * Calls the DropShip Pro API from a content script.
 *
 * The request is handed to the background worker instead of being issued here.
 * A content script runs in the page's context, so on an https:// shop a direct
 * call to a http://localhost API is blocked as mixed content — which is exactly
 * what produced "Failed to fetch". The worker has no such restriction.
 */
async function apiFetch(path, { method = 'GET', body = null } = {}) {
  const reply = await chrome.runtime.sendMessage({ type: 'dsp-api-fetch', path, method, body })
  if (!reply) throw new Error("L'extension n'a pas répondu, rechargez la page")
  if (!reply.ok) throw new Error(reply.error || `Erreur ${reply.status ?? ''}`.trim())
  return reply.data
}
