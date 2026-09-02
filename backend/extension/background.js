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
        // Les deux enregistrements partent ensemble : en oublier un laisserait
        // le relevé actif sur un site que le vendeur vient de retirer.
        await chrome.scripting.unregisterContentScripts({ ids: ['dsp-capture', 'dsp-sku-page'] })
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
        // Avant capture.js : le sélecteur lui demande l'ordre et les cases
        // cochées dès son ouverture.
        'content/photo-preselect.js',
        'content/capture.js',
      ],
      runAt: 'document_idle',
    })

    /*
     * Le relevé des variantes AliExpress, dans le monde de la page.
     *
     * **C'est un enregistrement à part, et il le faut.** Un script de contenu
     * ordinaire partage le DOM mais pas le tas JavaScript : les propriétés que
     * React pose sur les nœuds — `__reactInternalInstance$…` — lui sont
     * invisibles. Rangé avec les autres, le relevé ne trouvait donc jamais
     * rien, et rendait `null` sans la moindre erreur. Constaté le 02/09/2026
     * sur une vraie fiche : zéro combinaison, alors que la page en portait
     * quatre avec leurs prix.
     *
     * Il répond au script de capture par un évènement du DOM, seul passage sûr
     * entre les deux mondes.
     */
    await dspRegister({
      id: 'dsp-sku-page',
      matches: approvedSites.map((origin) => `${origin}/*`),
      js: ['content/aliexpress-sku.js'],
      world: 'MAIN',
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
  /*
   * La charge de publication, et non l'annonce brute.
   *
   * **`GET /products/:id` rend `Product.images` : les originaux, sans
   * filigrane.** Depuis que la marque se pose à l'export, ces adresses-là sont
   * les photos nues du fournisseur — et ce chemin les déposait telles quelles
   * sur Vinted, Leboncoin et Facebook Marketplace. Rien ne le signalait : les
   * annonces partaient, elles étaient acceptées, et le vendeur ne le découvrait
   * qu'en regardant une de ses annonces en ligne.
   *
   * `/publish-payload` passe par `imagesPourExport()`, donc par le filigrane.
   * Le panneau latéral l'utilisait déjà, avec un commentaire qui décrivait
   * exactement ce piège ; la correction n'avait jamais été faite ici.
   */
  const platformList = await api('/api/products/meta/platforms')

  const infoById = new Map(platformList.map((p) => [p.id, p]))
  const targets = platforms
    .map((id) => infoById.get(id))
    .filter((p) => p && p.sellUrl && !p.unavailable)

  if (!targets.length) {
    notify('DropShipper IA', "Aucune plateforme sélectionnée n'a de formulaire de dépôt.")
    return
  }

  const tabIds = []
  let titreGroupe = ''

  for (const target of targets) {
    /*
     * Une charge par destination, et non une seule pour toutes.
     *
     * Le titre dépend de la place de marché — Leboncoin en refuse plus de 50
     * caractères, Vinted plus de 70, Facebook plus de 100. Une charge unique
     * obligerait à prendre le plus petit dénominateur pour tout le monde, ou à
     * dépasser chez l'un pour satisfaire l'autre.
     */
    const charge = await api(
      `/api/products/${productId}/publish-payload?platform=${encodeURIComponent(target.id)}`,
    )
    titreGroupe = titreGroupe || charge.title

    const tab = await chrome.tabs.create({ url: target.sellUrl, active: false })
    tabIds.push(tab.id)
    await chrome.storage.local.set({
      [`job_${tab.id}`]: {
        productId,
        platform: target.id,
        platformLabel: target.label,
        // Déjà absolues et déjà filigranées : la route s'en charge.
        images: charge.images ?? [],
        titre: charge.title,
      },
    })
  }

  try {
    const groupId = await chrome.tabs.group({ tabIds })
    await chrome.tabGroups.update(groupId, {
      // `charge.title` : la charge de publication n'a pas de `aiTitle`, elle
      // porte déjà le titre retenu.
      title: `DropShipper IA — ${titreGroupe}`.slice(0, 40),
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
  /*
   * La session ouverte sur le site, reprise telle quelle.
   *
   * Le vendeur se connectait deux fois : une fois sur drop-shipper.fr, une fois
   * dans l extension, avec le meme mot de passe et dans le meme navigateur.
   * Rien ne l expliquait, et c etait le premier ecran qu il voyait.
   *
   * **Le message n est accepte que de nos propres pages.** `sender.url` est
   * pose par Chrome, pas par la page : un site tiers qui enverrait un jeton ne
   * passerait pas. Sans cette garde, n importe quelle page pourrait faire
   * travailler l extension au nom de quelqu un d autre.
   */
  if (message?.type === 'dsp-session-offerte') {
    ;(async () => {
      const origine = String(sender?.url || '')
      const notre = await getAppUrl()
      const permises = [notre, 'https://drop-shipper.fr', 'https://www.drop-shipper.fr']
      if (!permises.some((u) => u && origine.startsWith(u))) return sendResponse({ ok: false })

      const jeton = typeof message.jeton === 'string' ? message.jeton : ''
      if (jeton.length < 20) return sendResponse({ ok: false })

      // Remplace seulement si ca a change : le vendeur peut s etre reconnecte
      // sous un autre compte, et garder le premier jeton ferait travailler
      // l extension pour quelqu un d autre.
      const { token } = await chrome.storage.local.get('token')
      if (token !== jeton) await chrome.storage.local.set({ token: jeton })
      sendResponse({ ok: true })
    })()
    return true
  }

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

  /*
   * Ouvre le panneau latéral sur l'onglet d'où vient la demande.
   *
   * Chrome exige que `sidePanel.open()` parte d'un geste de l'utilisateur, et un
   * script de page n'a pas accès à cette API. Le clic du bouton dans la page
   * envoie donc ce message, et le worker ouvre — c'est le seul chemin que Chrome
   * accepte.
   */
  /*
   * Relève la fiche d'un onglet, pour la liste d'import groupé.
   *
   * Le panneau latéral n'est pas un onglet : il ne peut pas parler au script de
   * contenu directement, et `sender.tab` y vaut `undefined`. Il passe donc par
   * ici, avec l'identifiant de l'onglet à lire.
   *
   * Le script de contenu peut ne pas être là — site non autorisé, onglet ouvert
   * avant l'autorisation. On l'injecte alors une fois plutôt que de renvoyer un
   * échec que le vendeur ne saurait pas corriger.
   */
  if (message?.type === 'dsp-relever-onglet') {
    const tabId = message.tabId
    const demander = () =>
      chrome.tabs.sendMessage(tabId, { type: 'dsp-relever-pour-lot' })

    demander()
      .catch(async () => {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: [
            'config.js',
            'content/fill-helpers.js',
            'content/image-scan.js',
            'content/adapters.js',
            'content/photo-preselect.js',
            'content/capture.js',
          ],
        })
        // Le monde de la page, pour les variantes : même raison qu'à
        // l'enregistrement permanent.
        await chrome.scripting
          .executeScript({ target: { tabId }, files: ['content/aliexpress-sku.js'], world: 'MAIN' })
          .catch(() => undefined)
        return demander()
      })
      .then((reponse) => sendResponse(reponse ?? { ok: false, error: 'Page muette' }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Relevé impossible' }))
    return true
  }

  if (message?.type === 'dsp-open-panel') {
    const tabId = message.tabId ?? sender.tab?.id
    if (tabId === undefined) {
      sendResponse({ ok: false, error: 'Onglet inconnu' })
      return
    }
    chrome.sidePanel
      .open({ tabId })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }

  /*
   * Injecte le script de remplissage dans un onglet désigné.
   *
   * `dsp-fill-now` déduisait l'onglet de l'expéditeur, ce qui marche depuis une
   * page mais pas depuis le panneau latéral : lui n'est pas un onglet, et
   * `sender.tab` y vaut `undefined`. Le panneau passe donc l'identifiant.
   */
  if (message?.type === 'dsp-fill-tab') {
    const file = FILL_SCRIPTS[message.platform]
    if (!file || message.tabId === undefined) {
      sendResponse({ ok: false, error: 'Plateforme ou onglet inconnu' })
      return
    }
    chrome.scripting
      .executeScript({
        target: { tabId: message.tabId },
        files: ['config.js', 'content/fill-helpers.js', file],
      })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }

  if (message?.type === 'dsp-needs-login') {
    sendResponse({ ok: true })
  }
})

/*
 * Le panneau ne s'ouvre pas tout seul au clic sur l'icône.
 *
 * Le popup garde ce rôle : c'est là que le vendeur se connecte et autorise un
 * site, deux gestes qui n'ont rien à voir avec un dépôt en cours. Le panneau
 * s'ouvre depuis le bouton « Publier » de la page, quand il a une raison d'être.
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => {})
})
