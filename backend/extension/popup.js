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

/**
 * L'écran de connexion.
 *
 * Quatre défauts signalés le 02/09/2026, et le dernier explique les trois
 * autres :
 *
 * - **Pas d'œil** pour relire son mot de passe avant d'appuyer.
 * - **La suggestion d'adresse ne se cliquait pas.** Ce n'était pas une liste à
 *   nous : c'est l'autocomplétion de Chrome, et elle ne s'insère que dans un
 *   champ qui déclare `autocomplete` et porte un `name`. Sans eux, elle propose
 *   et refuse d'écrire.
 * - **Rien à enregistrer.** Un gestionnaire de mots de passe ne retient que ce
 *   qui est envoyé par un vrai `<form>` qu'on soumet. Un bouton qui appelle du
 *   JavaScript ne déclenche jamais la proposition d'enregistrement.
 * - **Rien pour dire qu'il faut un compte.** Celui qui installe l'extension sans
 *   compte se heurte à un formulaire qui refuse, sans lui dire où aller.
 *
 * Et surtout : quand une session est déjà ouverte sur drop-shipper.fr dans le
 * même navigateur, `content/session-bridge.js` la reprend et cet écran ne
 * s'affiche même pas.
 */
function renderLogin(error) {
  app.innerHTML = `
    <p class="muted">Connectez-vous à votre compte DropShipper IA.</p>

    <form id="loginForm" autocomplete="on">
      <input id="email" name="username" type="email" autocomplete="username"
             placeholder="Email" autofocus />
      <div class="champ-mdp">
        <input id="password" name="password" type="password" autocomplete="current-password"
               placeholder="Mot de passe" />
        <button type="button" id="voirMdp" class="oeil" title="Afficher le mot de passe"
                aria-label="Afficher le mot de passe">👁</button>
      </div>
      <button class="primary" type="submit" id="loginBtn">Se connecter</button>
    </form>

    ${error ? `<p class="error">${error}</p>` : ''}

    <p class="link" id="mdpOublie" style="margin-top:8px">Mot de passe oublié ?</p>

    <p class="muted" style="margin-top:12px">
      L'extension utilise le compte de <b>drop-shipper.fr</b>. Connectez-vous sur
      le site dans ce navigateur et elle reprendra la session toute seule — vous
      n'aurez rien à saisir ici.
    </p>
    <button id="ouvrirSite" style="width:100%;margin-top:6px;padding:8px;border:1px solid rgba(255,255,255,.18);background:transparent;color:inherit;border-radius:7px;font-size:12px;cursor:pointer">
      Ouvrir drop-shipper.fr et se connecter
    </button>
    <button id="creerCompte" style="width:100%;margin-top:6px;padding:8px;border:1px solid rgba(255,255,255,.18);background:transparent;color:inherit;border-radius:7px;font-size:12px;cursor:pointer">
      Créer un compte
    </button>

    <p class="link" id="openCfg" style="margin-top:10px">Configurer les adresses</p>
  `

  document.getElementById('openCfg').addEventListener('click', renderSettings)

  /*
   * Le mot de passe se récupère sur le site, pas ici.
   *
   * Refaire l'écran d'oubli dans le popup demanderait de recevoir un courriel,
   * de cliquer un lien, et de revenir — le lien ouvre le navigateur de toute
   * façon. Il manquait simplement la porte : le vendeur qui avait oublié son
   * mot de passe était devant un formulaire qui refuse, sans sortie.
   */
  document.getElementById('mdpOublie').addEventListener('click', async () => {
    chrome.tabs.create({ url: `${await getAppUrl()}/forgot-password` })
  })

  document.getElementById('ouvrirSite').addEventListener('click', async () => {
    chrome.tabs.create({ url: `${await getAppUrl()}/login` })
  })

  document.getElementById('creerCompte').addEventListener('click', async () => {
    chrome.tabs.create({ url: `${await getAppUrl()}/register` })
  })

  const champMdp = document.getElementById('password')
  document.getElementById('voirMdp').addEventListener('click', (e) => {
    const cache = champMdp.type === 'password'
    champMdp.type = cache ? 'text' : 'password'
    e.currentTarget.textContent = cache ? '🙈' : '👁'
    e.currentTarget.title = cache ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
    champMdp.focus()
  })

  /*
   * Un vrai `submit`, et non un clic sur un bouton.
   *
   * C'est ce qui déclenche la proposition d'enregistrement du gestionnaire de
   * mots de passe — celui de Chrome, celui de Google, ou n'importe quel autre.
   * Un `click` sur un bouton ne la déclenche jamais, quel que soit le reste du
   * formulaire.
   *
   * La touche Entrée marche par la même occasion, ce qui n'était pas le cas.
   */
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    const bouton = document.getElementById('loginBtn')
    bouton.disabled = true
    bouton.textContent = 'Connexion…'

    const email = document.getElementById('email').value
    const password = champMdp.value
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

  /*
   * Quand le bouton ne peut pas être proposé, le dire.
   *
   * L'encadré disparaissait sans un mot dès que l'onglet actif n'était pas une
   * page https — `chrome://extensions` juste après un rechargement de
   * l'extension, une page d'accueil, un onglet vide. Le vendeur venait
   * précisément d'ouvrir le popup pour ajouter le bouton, et lisait à la place
   * un panneau où l'option n'existait plus : impossible d'en conclure autre
   * chose qu'une panne.
   */
  if (!tab?.url || !tab.url.startsWith('https://')) {
    return `
      <div class="site-box">
        <div class="site-title">✨ Ajouter le bouton à un site</div>
        <p class="muted">Cet onglet n'est pas une page marchande — c'est
        ${tab?.url?.startsWith('chrome') ? 'une page interne de Chrome' : 'une page sans adresse https'}.
        Ouvrez la fiche du produit qui vous intéresse, puis rouvrez ce panneau :
        le bouton se propose là.</p>
      </div>`
  }

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

     <!--
       L'entrée du lot est ici aussi, et pas seulement dans le panneau.
       Le popup est ce qu'on ouvre en cliquant l'icône : c'est là qu'on cherche
       une fonction dont on a entendu parler. La reléguer derrière « ouvrir le
       panneau » revenait à la cacher — signalé le 02/09/2026, « aucun bouton
       créer une liste ».
     -->
     <button class="primary" id="ouvrirLot" style="margin-top:10px">📦 Créer une liste d'import groupé</button>
     <p class="muted" style="margin-top:6px">
       Pour importer plusieurs produits d'un coup depuis AliExpress ou Temu :
       vous naviguez de fiche en fiche, le panneau reste ouvert et chaque produit
       s'ajoute à la liste.
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

  /*
   * Ouvre le panneau **déjà sur la liste**.
   *
   * Le drapeau est posé avant l'ouverture, sinon le panneau s'affiche sur la
   * liste des annonces et il faut cliquer une seconde fois. Et `sidePanel.open`
   * part d'ici sans détour : Chrome exige que l'appel vienne du geste de
   * l'utilisateur, un aller-retour par le service worker sortirait de la
   * fenêtre autorisée.
   */
  document.getElementById('ouvrirLot').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    await chrome.storage.local.set({ lotOuvert: true })
    try {
      await chrome.sidePanel.open({ tabId: tab.id })
      window.close()
    } catch (err) {
      app.insertAdjacentHTML('beforeend', `<p class="error">Panneau indisponible : ${err.message}</p>`)
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
