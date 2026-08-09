// Clears any queued listing when the extension starts, so a listing selected in a
// previous session never gets injected unexpectedly into a form opened later.
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove('pendingListing')
})

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove('pendingListing')
})
