// Where each platform's "create listing" form lives. The content script for that
// platform picks the pending listing back up from chrome.storage once the tab loads.
const app = document.getElementById('app')

async function getToken() {
  const { token } = await chrome.storage.local.get('token')
  return token
}

async function api(path, options = {}) {
  const token = await getToken()
  const res = await fetch(`${await getApiBase()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Erreur ${res.status}`)
  }
  return res.json()
}

async function renderSettings(error) {
  const [apiBase, appUrl] = await Promise.all([getApiBase(), getAppUrl()])
  app.innerHTML = `
    <p class="muted">Deux adresses <b>différentes</b> : le serveur, et le site.</p>

    <label class="muted" style="margin-top:8px;display:block">API — le serveur</label>
    <input id="apiBase" type="url" value="${apiBase}" placeholder="https://xxx.up.railway.app" />
    <p class="muted" style="margin-top:3px">Ce n'est <b>pas</b> l'adresse de votre site : elle se termine en général par <b>.up.railway.app</b></p>

    <label class="muted" style="margin-top:10px;display:block">Application — le site</label>
    <input id="appUrl" type="url" value="${appUrl}" placeholder="https://www.mon-site.fr" />

    <button class="primary" id="saveCfg">Vérifier et enregistrer</button>
    ${error ? `<p class="error">${error}</p>` : ''}
    <p class="link" id="backCfg" style="margin-top:10px">Retour</p>
  `

  document.getElementById('saveCfg').addEventListener('click', async () => {
    const btn = document.getElementById('saveCfg')
    const api = document.getElementById('apiBase').value.trim().replace(/\/$/, '')
    const site = document.getElementById('appUrl').value.trim().replace(/\/$/, '')

    btn.disabled = true
    btn.textContent = 'Vérification…'

    // The classic mistake is pasting the site address in the API field: the
    // frontend host serves static files and answers 405 to every POST, which is
    // impossible to diagnose from the outside. So the address is tested first.
    try {
      const res = await fetch(`${api}/api/health`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) throw new Error('reponse inattendue')
    } catch {
      return renderSettings(
        "Cette adresse ne répond pas comme l'API DropShipper IA. Avez-vous saisi l'adresse du site à la place de celle du serveur ?",
      )
    }

    await setApiBase(api)
    if (site) await setAppUrl(site)
    // Drop the old session: a token issued by another backend isn't valid here.
    await chrome.storage.local.remove('token')
    renderLogin()
  })

  document.getElementById('backCfg').addEventListener('click', () => start())
}

function renderLogin(error) {
  app.innerHTML = `
    <p class="muted">Connectez-vous à votre compte DropShipper IA.</p>
    <input id="email" type="email" placeholder="Email" />
    <input id="password" type="password" placeholder="Mot de passe" />
    <button class="primary" id="loginBtn">Se connecter</button>
    ${error ? `<p class="error">${error}</p>` : ''}
    <p class="link" id="openCfg" style="margin-top:10px">Configurer les adresses</p>
  `
  document.getElementById('openCfg').addEventListener('click', renderSettings)
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value
    const password = document.getElementById('password').value
    try {
      const res = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      await chrome.storage.local.set({ token: res.token })
      renderAccueil()
    } catch (err) {
      renderLogin(err.message)
    }
  })
}

/**
 * Panel offering to activate the capture button on the site currently open.
 *
 * The extension asks Chrome for that one origin rather than shipping a blanket
 * permission on every site: the user sees which site is concerned, and grants it
 * knowingly.
 */
async function renderSiteBox() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url || !tab.url.startsWith('https://')) return ''

  const origin = new URL(tab.url).origin
  const host = new URL(tab.url).hostname.replace('www.', '')
  const { approvedSites = [] } = await chrome.storage.local.get('approvedSites')
  const already = approvedSites.includes(origin)

  return `
    <div class="site-box ${already ? 'on' : ''}">
      ${
        already
          ? `<div class="site-title">✨ Bouton actif sur <b>${host}</b></div>
             <p class="muted">Ouvrez une fiche produit : le bouton apparaît en bas à droite.</p>
             <button class="ghost" id="siteOff" data-origin="${origin}">Retirer de ce site</button>`
          : `<div class="site-title">✨ Ajouter le bouton à <b>${host}</b></div>
             <p class="muted">Chrome vous demandera l'autorisation pour ce site : acceptez-la.
             Un bouton apparaîtra alors en bas à droite de vos onglets pour envoyer le produit
             consulté vers DropShipper IA, sans copier-coller.</p>
             <button class="primary" id="siteOn" data-origin="${origin}">Ajouter le bouton à ce site</button>`
      }
    </div>`
}

function wireSiteBox() {
  document.getElementById('siteOn')?.addEventListener('click', async (e) => {
    const origin = e.target.dataset.origin
    // Must be called straight from the click: Chrome refuses the prompt otherwise.
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] })
    if (!granted) return

    const { approvedSites = [] } = await chrome.storage.local.get('approvedSites')
    await chrome.storage.local.set({ approvedSites: [...new Set([...approvedSites, origin])] })

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) chrome.tabs.reload(tab.id)
    window.close()
  })

  document.getElementById('siteOff')?.addEventListener('click', async (e) => {
    const origin = e.target.dataset.origin
    const { approvedSites = [] } = await chrome.storage.local.get('approvedSites')
    await chrome.storage.local.set({ approvedSites: approvedSites.filter((o) => o !== origin) })
    await chrome.permissions.remove({ origins: [`${origin}/*`] })
    start()
  })
}

/**
 * L'accueil du popup : se connecter, autoriser un site, ouvrir le panneau.
 *
 * **La liste des annonces n'est plus ici.** Elle exigeait un appel réseau avant
 * le moindre affichage : le popup restait sur « Chargement des produits… »
 * pendant une seconde, à chaque clic sur l'icône, y compris quand le vendeur
 * venait simplement autoriser un site. Elle vit maintenant dans le panneau
 * latéral, là où elle sert — devant le formulaire de dépôt, et à côté de lui.
 */
async function renderAccueil() {
  app.innerHTML =
    (await renderSiteBox()) +
    `<button class="primary" id="ouvrirPanneau">Ouvrir le panneau des annonces</button>
     <p class="muted" style="margin-top:6px">
       Le panneau s'ouvre à côté de la page et y reste : vous voyez votre annonce
       pendant que vous remplissez le formulaire.
     </p>
     <p class="link" id="openCfg2" style="margin-top:12px">Configurer les adresses</p>
     <p class="link" id="logout">Déconnexion</p>`

  wireSiteBox()

  document.getElementById('ouvrirPanneau').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    /*
     * Ouvert d'ici et non par un message : Chrome exige que l'appel parte du
     * geste de l'utilisateur, et le popup en est un. Passer par le worker
     * ajouterait un aller-retour qui ferait sortir de la fenêtre autorisée.
     */
    try {
      await chrome.sidePanel.open({ tabId: tab.id })
      window.close()
    } catch (err) {
      app.insertAdjacentHTML(
        'beforeend',
        `<p class="error">Panneau indisponible : ${err.message}</p>`,
      )
    }
  })

  document.getElementById('openCfg2').addEventListener('click', () => renderSettings())
  document.getElementById('logout').addEventListener('click', async () => {
    await chrome.storage.local.remove('token')
    renderLogin()
  })
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function start() {
  getToken().then((token) => (token ? renderAccueil() : renderLogin()))
}

start()
