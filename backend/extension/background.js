importScripts('config.js')

// Clears any queued listing when the extension starts, so a listing selected in a
// previous session never gets injected unexpectedly into a form opened later.
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove(['pendingListing', 'session'])
  registerAppBridge()
  registerApprovedSites()
})
chrome.runtime.onInstalled.addListener(async () => {
  chrome.storage.local.remove(['pendingListing', 'session'])
  await forgetLocalhostAddresses()
  registerAppBridge()
  registerApprovedSites()
})

/**
 * Drops addresses left over from a dev machine.
 *
 * Older builds defaulted to http://localhost:4000 and stored it, so every call
 * failed with "Failed to fetch" on a machine with no dev server running. Clearing
 * the stored value lets the production default apply; the popup can always set a
 * local address again for development.
 */
async function forgetLocalhostAddresses() {
  const { apiBase, appUrl } = await chrome.storage.local.get(['apiBase', 'appUrl'])
  const stale = []
  if (apiBase && apiBase.includes('localhost')) stale.push('apiBase')
  if (appUrl && appUrl.includes('localhost')) stale.push('appUrl')
  if (stale.length) await chrome.storage.local.remove(stale)
}

/**
 * Serialises content-script registrations.
 *
 * registerAppBridge runs from onInstalled, from onStartup and from every storage
 * change — and forgetLocalhostAddresses itself writes to storage, so two calls
 * could overlap. Both then passed the unregister step and both registered the
 * same id, which Chrome rejects as a duplicate script ID. Chaining the calls
 * makes the sequence unregister-then-register atomic in practice.
 */
let dspRegistrations = Promise.resolve()

function dspQueue(task) {
  dspRegistrations = dspRegistrations.then(task, task)
  return dspRegistrations
}

/** Registers one content script, replacing any previous version of it. */
async function dspRegister(script) {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [script.id] })
  } catch {
    // Nothing registered yet, which is the normal case on a fresh install.
  }
  try {
    await chrome.scripting.registerContentScripts([script])
  } catch (err) {
    // A duplicate can still slip through if two workers raced: drop it and retry
    // once rather than leaving the page without its script.
    if (String(err).includes('Duplicate script ID')) {
      try {
        await chrome.scripting.unregisterContentScripts({ ids: [script.id] })
        await chrome.scripting.registerContentScripts([script])
        return
      } catch (retryErr) {
        console.error(`enregistrement de ${script.id} impossible`, retryErr)
        return
      }
    }
    console.error(`enregistrement de ${script.id} impossible`, err)
  }
}

/**
 * The app↔extension bridge has to run on whatever origin the app is served from,
 * which isn't known at build time (localhost in dev, the Vercel domain in prod).
 * Manifest content_scripts can't take a runtime value, so it's registered here and
 * re-registered whenever the user changes the app URL in the popup.
 */
function registerAppBridge() {
  return dspQueue(async () => {
    const appUrl = await getAppUrl()
    await dspRegister({
      id: 'dsp-app-bridge',
      matches: [`${appUrl}/*`],
      js: ['config.js', 'content/app-bridge.js'],
      runAt: 'document_idle',
    })
  })
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
function registerApprovedSites() {
  return dspQueue(async () => {
    const { approvedSites = [] } = await chrome.storage.local.get('approvedSites')
    if (!approvedSites.length) {
      try {
        await chrome.scripting.unregisterContentScripts({ ids: ['dsp-capture'] })
      } catch {
        // Nothing to remove.
      }
      return
    }

    await dspRegister({
      id: 'dsp-capture',
      matches: approvedSites.map((origin) => `${origin}/*`),
      // adapters.js avant capture.js : la capture demande a l adaptateur du site
      // ce qu il sait, et retombe sur le scan generique quand il ne sait rien.
      js: [
        'config.js',
        'content/fill-helpers.js',
        'content/image-scan.js',
        'content/adapters.js',
        'content/capture.js',
      ],
      runAt: 'document_idle',
    })
  })
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
      try {
        const appUrl = await getAppUrl()
        const target = message.productId ? `${appUrl}/products/${message.productId}` : `${appUrl}/dashboard`

        // Always a new tab, opened right beside the supplier page rather than
        // replacing it or hijacking an app tab already showing another listing:
        // the seller needs both side by side to compare.
        await chrome.tabs.create({
          url: target,
          active: true,
          index: sender.tab ? sender.tab.index + 1 : undefined,
          openerTabId: sender.tab?.id,
        })
        sendResponse({ ok: true })
      } catch (err) {
        sendResponse({ ok: false, error: err.message })
      }
    })()
    return true
  }

  if (message?.type === 'dsp-needs-login') {
    sendResponse({ ok: true })
  }
})
