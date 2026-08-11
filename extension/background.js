importScripts('config.js')

// Clears any queued listing when the extension starts, so a listing selected in a
// previous session never gets injected unexpectedly into a form opened later.
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove(['pendingListing', 'session'])
  registerAppBridge()
  registerApprovedSites()
})
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove(['pendingListing', 'session'])
  registerAppBridge()
  registerApprovedSites()
})

/**
 * The app↔extension bridge has to run on whatever origin the app is served from,
 * which isn't known at build time (localhost in dev, the Vercel domain in prod).
 * Manifest content_scripts can't take a runtime value, so it's registered here and
 * re-registered whenever the user changes the app URL in the popup.
 */
async function registerAppBridge() {
  const appUrl = await getAppUrl()
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['dsp-app-bridge'] })
  } catch {
    // Nothing registered yet on a fresh install.
  }
  try {
    await chrome.scripting.registerContentScripts([
      {
        id: 'dsp-app-bridge',
        matches: [`${appUrl}/*`],
        js: ['config.js', 'content/app-bridge.js'],
        runAt: 'document_idle',
      },
    ])
  } catch (err) {
    console.error('registerAppBridge failed', err)
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.appUrl) registerAppBridge()
})

/**
 * Re-registers the capture button on every site the user has approved.
 *
 * The extension no longer injects itself everywhere: each site is authorised from
 * the popup, which asks Chrome for that origin only. Registrations don't survive a
 * browser restart, so they are rebuilt from the stored list.
 */
async function registerApprovedSites() {
  const { approvedSites = [] } = await chrome.storage.local.get('approvedSites')
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['dsp-capture'] })
  } catch {
    // Not registered yet.
  }
  if (!approvedSites.length) return

  try {
    await chrome.scripting.registerContentScripts([
      {
        id: 'dsp-capture',
        matches: approvedSites.map((origin) => `${origin}/*`),
        js: ['config.js', 'content/fill-helpers.js', 'content/capture.js'],
        runAt: 'document_idle',
      },
    ])
  } catch (err) {
    console.error('enregistrement des sites autorisés impossible', err)
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.approvedSites) registerApprovedSites()
})

const FILL_SCRIPTS = {
  VINTED: 'content/vinted.js',
  LEBONCOIN: 'content/leboncoin.js',
  EBAY: 'content/ebay.js',
  FACEBOOK: 'content/facebook.js',
}

async function api(path, options = {}) {
  const { token } = await chrome.storage.local.get('token')
  const res = await fetch(`${await getApiBase()}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
  })
  if (!res.ok) throw new Error(`Erreur ${res.status}`)
  return res.json()
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon128.png',
    title,
    message,
  })
}

/**
 * Opens one tab per selected marketplace, grouped together so the seller sees them
 * as a single "diffusion" batch, then drives the AI agent in each one.
 *
 * Tabs are opened inactive: the run must not steal focus while the user works.
 */
async function runSession({ productId, platforms }) {
  const [product, platformList] = await Promise.all([
    api(`/api/products/${productId}`),
    api('/api/products/meta/platforms'),
  ])

  const infoById = new Map(platformList.map((p) => [p.id, p]))
  const targets = platforms
    .map((id) => infoById.get(id))
    .filter((p) => p && p.sellUrl && !p.unavailable)

  if (!targets.length) {
    notify('DropShipper IA', "Aucune plateforme sélectionnée n'a de formulaire de dépôt.")
    return
  }

  const apiBase = await getApiBase()
  const images = (product.images || []).map((img) => (img.startsWith('/') ? `${apiBase}${img}` : img))
  const tabIds = []

  for (const target of targets) {
    const tab = await chrome.tabs.create({ url: target.sellUrl, active: false })
    tabIds.push(tab.id)
    await chrome.storage.local.set({
      [`job_${tab.id}`]: {
        productId,
        platform: target.id,
        platformLabel: target.label,
        images,
      },
    })
  }

  try {
    const groupId = await chrome.tabs.group({ tabIds })
    await chrome.tabGroups.update(groupId, {
      title: `DropShipper IA — ${product.aiTitle || product.title}`.slice(0, 40),
      color: 'purple',
    })
  } catch {
    // Tab groups aren't available in every Chromium build; the run still works.
  }

  notify(
    'Diffusion lancée',
    `${targets.length} onglet(s) ouverts. Ne les fermez pas tant que DropShipper IA travaille.`,
  )
}

/** Injects the agent into a tab and asks it to fill the form. */
async function driveTab(tabId, job) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['config.js', 'content/fill-helpers.js', 'content/agent.js'],
    })
    const result = await chrome.tabs.sendMessage(tabId, { type: 'dsp-run-agent', job })

    if (result?.status === 'awaiting-login') {
      notify(`Connexion requise — ${job.platformLabel}`, `Connectez-vous, le remplissage démarrera tout seul.`)
    } else if (result?.status === 'filled') {
      notify(
        `${job.platformLabel} prêt`,
        `${result.applied} champ(s) et ${result.images} photo(s) remplis. Relisez puis publiez.`,
      )
    }
  } catch (err) {
    console.error('driveTab failed', err)
  }
}

// Each tab runs as soon as it finishes loading. Re-running on every completed load
// is what makes the login flow seamless: the user signs in, the page reloads, and
// the agent picks up by itself without anyone clicking again.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return
  const stored = await chrome.storage.local.get(`job_${tabId}`)
  const job = stored[`job_${tabId}`]
  if (!job) return
  driveTab(tabId, job)
})

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.local.remove(`job_${tabId}`))

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Proxy for content scripts: see apiFetch() in config.js for why they can't
  // call the API themselves.
  if (message?.type === 'dsp-api-fetch') {
    ;(async () => {
      try {
        const { token } = await chrome.storage.local.get('token')
        if (!token) return sendResponse({ ok: false, error: "Connectez-vous via l'icône DropShipper IA" })

        const res = await fetch(`${await getApiBase()}${message.path}`, {
          method: message.method,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: message.body ? JSON.stringify(message.body) : undefined,
        })
        const data = await res.json().catch(() => ({}))
        sendResponse(
          res.ok
            ? { ok: true, data }
            : { ok: false, status: res.status, error: data.error || `Erreur ${res.status}` },
        )
      } catch (err) {
        // Almost always the API being unreachable: wrong address, or server down.
        sendResponse({
          ok: false,
          error: `API injoignable (${await getApiBase()}). Vérifiez l'adresse dans le popup de l'extension.`,
        })
      }
    })()
    return true
  }

  // Launched from the DropShipper IA web app (relayed by content/app-bridge.js).
  if (message?.type === 'dsp-start-session') {
    runSession(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        notify('Diffusion impossible', err.message)
        sendResponse({ ok: false, error: err.message })
      })
    return true
  }

  // Legacy single-platform path: the in-page launcher picked a product and the
  // form is already open, so re-inject that platform's fill script right away.
  if (message?.type === 'dsp-fill-now') {
    const file = FILL_SCRIPTS[message.platform]
    const tabId = sender.tab?.id
    if (!file || tabId === undefined) {
      sendResponse({ ok: false, error: 'Plateforme non supportée' })
      return
    }
    chrome.scripting
      .executeScript({ target: { tabId }, files: ['config.js', 'content/fill-helpers.js', file] })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }

  // Opens the freshly captured listing, reusing the app's tab when one is already
  // open rather than piling up duplicates.
  if (message?.type === 'dsp-open-product') {
    ;(async () => {
      const appUrl = await getAppUrl()
      const target = message.productId ? `${appUrl}/products/${message.productId}` : `${appUrl}/dashboard`
      const [existing] = await chrome.tabs.query({ url: `${appUrl}/*` })
      if (existing?.id) {
        await chrome.tabs.update(existing.id, { url: target, active: true })
        await chrome.windows.update(existing.windowId, { focused: true })
      } else {
        await chrome.tabs.create({ url: target, active: true })
      }
      sendResponse({ ok: true })
    })()
    return true
  }

  if (message?.type === 'dsp-needs-login') {
    sendResponse({ ok: true })
  }
})
