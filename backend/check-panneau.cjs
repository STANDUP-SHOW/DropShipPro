/**
 * Ce que le panneau latéral affiche, dans chacun de ses états.
 *
 *   cd backend && node check-panneau.cjs
 *
 * **Le trou que ce banc comble.** `check-lot.cjs` éprouve la liste d'import
 * groupé isolément — et elle passait — pendant que le bouton qui y mène
 * n'apparaissait pas dans le panneau. Éprouver une fonction sans éprouver le
 * chemin qui y conduit revient à livrer une pièce que personne ne peut
 * atteindre. C'est la troisième fois que ce défaut se produit sur ce projet.
 *
 * Il monte `sidepanel.html` avec ses trois scripts et un faux `chrome`, comme
 * Chrome le ferait, et regarde ce qui s'affiche.
 */
const { JSDOM } = require('jsdom')
const fs = require('fs')
const path = require('path')

const DOSSIER = path.join(__dirname, 'extension')
const lire = (f) => fs.readFileSync(path.join(DOSSIER, f), 'utf8')

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

/**
 * Les scripts que la page charge, lus dans l'ordre du HTML.
 *
 * Lus **dans le fichier** et non recopiés ici : une liste écrite à la main
 * oublierait le script ajouté hier, c'est-à-dire celui qu'on veut éprouver.
 */
function scriptsDeLaPage() {
  const html = lire('sidepanel.html')
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1])
}

function monter({ token = 'x'.repeat(40), annonces = [], pendingListing = null, lotOuvert = false } = {}) {
  const dom = new JSDOM(lire('sidepanel.html'), {
    runScripts: 'dangerously',
    url: 'https://panneau.test/',
  })
  const w = dom.window
  const stockage = { token, apiBase: 'https://api.test', appUrl: 'https://www.drop-shipper.fr' }
  if (pendingListing) stockage.pendingListing = pendingListing
  if (lotOuvert) stockage.lotOuvert = true

  w.chrome = {
    storage: {
      local: {
        async get(cle) {
          const cles = typeof cle === 'string' ? [cle] : Array.isArray(cle) ? cle : Object.keys(cle ?? {})
          const o = {}
          for (const k of cles) if (stockage[k] !== undefined) o[k] = stockage[k]
          return o
        },
        async set(o) {
          Object.assign(stockage, o)
        },
        async remove(k) {
          delete stockage[k]
        },
      },
      onChanged: { addListener() {} },
    },
    tabs: {
      async query() {
        return [{ id: 7, url: 'https://fr.aliexpress.com/item/1.html' }]
      },
      create() {},
    },
    runtime: { async sendMessage() { return { ok: true } } },
  }

  w.fetch = async () => ({ ok: true, async json() { return annonces } })

  for (const f of scriptsDeLaPage()) {
    const s = w.document.createElement('script')
    s.textContent = lire(f)
    w.document.head.appendChild(s)
  }

  return { w, stockage, app: () => w.document.getElementById('app') }
}

const attendre = (ms = 80) => new Promise((r) => setTimeout(r, ms))
const cliquer = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))

;(async () => {
  console.log('\nLes scripts chargés par la page')
  {
    const scripts = scriptsDeLaPage()
    verifier('config.js est chargé', scripts.includes('config.js'))
    verifier('lot.js est chargé', scripts.includes('lot.js'), scripts.join(', '))
    verifier('sidepanel.js est chargé', scripts.includes('sidepanel.js'))
    verifier(
      'lot.js avant sidepanel.js — il en dépend',
      scripts.indexOf('lot.js') < scripts.indexOf('sidepanel.js'),
    )
    for (const f of scripts) {
      verifier(`${f} existe`, fs.existsSync(path.join(DOSSIER, f)))
    }
  }

  console.log("\nConnecté, avec des annonces")
  {
    const { w, app } = monter({
      annonces: [{ id: 'p1', aiTitle: 'Souris Bluetooth', sellingPrice: 24.9, images: [] }],
    })
    await attendre(150)
    const t = app().textContent
    verifier('le bouton du lot est là', /liste d'import group/i.test(t), t.slice(0, 70))
    verifier('le bouton porte un identifiant utilisable', !!app().querySelector('#ouvrir-lot'))
    verifier('la liste des annonces est là aussi', /Souris Bluetooth/.test(t))
  }

  console.log("\nConnecté, sans aucune annonce")
  {
    /*
     * Le cas d'un compte neuf, et il compte.
     *
     * C'est précisément celui qui veut importer en lot : il n'a rien. Un bouton
     * qui n'apparaîtrait que sous une liste non vide serait invisible pour lui.
     */
    const { w, app } = monter({ annonces: [] })
    await attendre(150)
    verifier('le bouton du lot est là quand même', !!app().querySelector('#ouvrir-lot'))
  }

  console.log('\nLe clic ouvre la liste')
  {
    const { w, app, stockage } = monter({ annonces: [] })
    await attendre(150)
    const bouton = app().querySelector('#ouvrir-lot')
    if (bouton) {
      cliquer(w, bouton)
      await attendre(120)
      verifier('la liste s’affiche', /liste est vide|0 \/ 25/i.test(app().textContent))
      verifier('et elle est retenue pour les onglets suivants', stockage.lotOuvert === true)
    } else {
      verifier('la liste s’affiche', false, 'bouton absent')
      verifier('et elle est retenue pour les onglets suivants', false, 'bouton absent')
    }
  }

  console.log('\nUn lot déjà commencé prime sur la liste des annonces')
  {
    const { app } = monter({ annonces: [], lotOuvert: true })
    await attendre(150)
    verifier('le panneau rouvre sur le lot', /import group/i.test(app().textContent))
  }

  console.log('\nUne publication en cours prime sur tout')
  {
    const { app } = monter({
      pendingListing: { target: 'VINTED', title: 'Veste', images: [], aiTitle: 'Veste' },
    })
    await attendre(150)
    const t = app().textContent
    verifier('le lot ne vient pas déranger un dépôt commencé', !/import group/i.test(t))
    verifier("l'annonce en cours est montrée", /Veste/.test(t))
  }

  console.log('\nDéconnecté')
  {
    const { app } = monter({ token: null })
    await attendre(150)
    verifier('on dit où se connecter', /icône de l'extension/i.test(app().textContent))
  }

  console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
  process.exit(echecs ? 1 : 0)
})()
