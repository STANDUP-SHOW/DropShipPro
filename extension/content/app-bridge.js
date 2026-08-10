/**
 * Bridge between the DropShip Pro web app and the extension.
 *
 * Runs only on the app's own origin. The app can't message the extension directly
 * without knowing its generated id, so it posts a window message and this relays it
 * to the background worker. It also tells the app the extension is installed, which
 * is how the "Diffuser" button knows whether to offer the automated flow.
 */
;(() => {
  const ALLOWED = ['dsp-start-session']

  window.addEventListener('message', (event) => {
    // Only accept messages posted by the app itself, never by an embedded frame.
    if (event.source !== window) return
    const data = event.data
    if (!data || data.source !== 'droppost-app' || !ALLOWED.includes(data.type)) return

    chrome.runtime.sendMessage({ type: data.type, payload: data.payload }, (response) => {
      window.postMessage(
        { source: 'droppost-extension', type: `${data.type}-result`, response: response ?? { ok: false } },
        window.location.origin,
      )
    })
  })

  const version = chrome.runtime.getManifest().version

  // A marker on <html> the app can read at any moment. The announcement below is
  // one-shot and usually fires before React has mounted its listener, so on its
  // own it made the app report "extension non détectée" while installed.
  document.documentElement.dataset.dropshipProExtension = version

  // Answer late askers: a dialog opened long after page load can still check.
  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    if (event.data?.source !== 'droppost-app' || event.data?.type !== 'dsp-ping') return
    window.postMessage({ source: 'droppost-extension', type: 'dsp-extension-ready', version }, window.location.origin)
  })

  window.postMessage({ source: 'droppost-extension', type: 'dsp-extension-ready', version }, window.location.origin)
})()
