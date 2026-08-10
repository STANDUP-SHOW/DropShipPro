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
