// Clears any queued listing when the extension starts, so a listing selected in a
// previous session never gets injected unexpectedly into a form opened later.
chrome.runtime.onStartup.addListener(() => chrome.storage.local.remove('pendingListing'))
chrome.runtime.onInstalled.addListener(() => chrome.storage.local.remove('pendingListing'))

const FILL_SCRIPTS = {
  VINTED: 'content/vinted.js',
  LEBONCOIN: 'content/leboncoin.js',
  EBAY: 'content/ebay.js',
}

// The per-platform fill scripts only run once at page load. When the user picks a
// product from the in-page launcher, the form is already open, so re-inject the
// script to fill it immediately instead of making them reload the page.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'dsp-fill-now') return

  const file = FILL_SCRIPTS[message.platform]
  const tabId = sender.tab?.id
  if (!file || tabId === undefined) {
    sendResponse({ ok: false, error: 'Plateforme non supportée pour le remplissage automatique' })
    return
  }

  chrome.scripting
    .executeScript({ target: { tabId }, files: ['content/fill-helpers.js', file] })
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, error: err.message }))

  return true // keep the message channel open for the async response
})
