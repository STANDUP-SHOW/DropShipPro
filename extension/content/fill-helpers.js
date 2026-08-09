/**
 * Shared form-filling helpers for the per-platform content scripts.
 *
 * These sites are React/Vue apps, so assigning `input.value` directly is ignored:
 * the framework tracks its own state and overwrites the DOM on the next render.
 * setNativeValue calls the underlying value setter and dispatches the events the
 * framework actually listens to, which is what makes the value stick.
 */

function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter ? setter.call(el, value) : (el.value = value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/** Waits for a selector to appear — these forms render progressively after load. */
function waitFor(selector, timeout = 15000) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector)
    if (existing) return resolve(existing)

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el) {
        observer.disconnect()
        resolve(el)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, timeout)
  })
}

/** Tries several selectors in order and fills the first one that exists. */
async function fillFirst(selectors, value) {
  if (!value) return false
  for (const selector of selectors) {
    const el = document.querySelector(selector)
    if (el) {
      setNativeValue(el, value)
      return true
    }
  }
  const el = await waitFor(selectors[0], 5000)
  if (el) {
    setNativeValue(el, value)
    return true
  }
  return false
}

/**
 * Injects downloaded images into a file input. Browsers forbid setting
 * input.files directly, but a DataTransfer holding real File objects is accepted
 * and is the same mechanism a drag-and-drop uses.
 */
async function attachImages(fileInput, imageUrls) {
  if (!fileInput || !imageUrls?.length) return 0
  const dt = new DataTransfer()
  let count = 0
  for (const [i, url] of imageUrls.entries()) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const blob = await res.blob()
      dt.items.add(new File([blob], `photo-${i + 1}.jpg`, { type: blob.type || 'image/jpeg' }))
      count++
    } catch {
      // Skip images that fail to download rather than aborting the whole fill.
    }
  }
  if (!count) return 0
  fileInput.files = dt.files
  fileInput.dispatchEvent(new Event('change', { bubbles: true }))
  return count
}

/** Small on-page banner so the user sees what was filled and what needs manual work. */
function showBanner(message, tone = 'info') {
  document.getElementById('dsp-banner')?.remove()
  const bar = document.createElement('div')
  bar.id = 'dsp-banner'
  bar.textContent = message
  Object.assign(bar.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    zIndex: '2147483647',
    padding: '10px 16px',
    font: '600 13px system-ui, sans-serif',
    color: '#fff',
    background: tone === 'error' ? '#dc2626' : 'linear-gradient(90deg, #a855f7, #ec4899)',
    textAlign: 'center',
  })
  document.body.appendChild(bar)
  setTimeout(() => bar.remove(), 9000)
}

/** Reads and clears the listing queued by the popup, so a reload doesn't refill. */
async function consumePendingListing(expectedTarget) {
  const { pendingListing } = await chrome.storage.local.get('pendingListing')
  if (!pendingListing || pendingListing.target !== expectedTarget) return null
  await chrome.storage.local.remove('pendingListing')
  return pendingListing
}
