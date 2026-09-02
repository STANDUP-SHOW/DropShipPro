/**
 * Ce que le popup de l'extension affiche réellement, écran par écran.
 *
 *   cd backend && node check-popup.cjs
 *
 * **Pourquoi ce banc existe.** `extension/check.cjs` vérifie la syntaxe et les
 * constantes jamais définies — de vraies pannes, mais des pannes du fichier.
 * Rien ne vérifiait ce que le vendeur **voit**. Résultat : trois allers-retours
 * sur le même écran de connexion, chacun corrigeant un manque qu'un simple
 * regard aurait montré — pas d'œil sur le mot de passe, puis pas de lien
 * « mot de passe oublié », puis un encadré qui disparaissait sans un mot.
 *
 * Et cet écran ne s'ouvre pas facilement : le popup vit derrière une adresse
 * `chrome-extension://`, hors de portée de tout outil d'automatisation. Il
 * fallait donc le monter ici, avec un faux `chrome`, et le regarder.
 *
 * Le banc décrit des **attentes de vendeur**, pas des détails de code : « on
 * peut retrouver son mot de passe », « on sait où se connecter », « on sait
 * pourquoi le bouton n'est pas proposé ». Elles survivent à une réécriture du
 * popup, ce qu'un sélecteur CSS ne ferait pas.
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
 * Une attente qui lève est une attente ratée, pas un banc interrompu.
 *
 * Constaté en éprouvant ce banc contre l'ancien popup : le bouton
 * « se connecter sur le site » n'existait pas, `querySelector` a rendu `null`,
 * le clic a levé — et les quatre sections suivantes n'ont jamais tourné. Le
 * banc rapportait donc **deux** manques là où il y en avait cinq, et il
 * l'annonçait sans rien signaler d'anormal. Un contrôle qui s'arrête au premier
 * défaut cache tous les autres, ce qui est précisément ce qu'on lui demande
 * d'éviter.
 */
function verifierSansLever(nom, calcul, detail = '') {
  try {
    verifier(nom, calcul(), detail)
  } catch (e) {
    verifier(nom, false, `l'écran ne le porte pas (${e.message.slice(0, 60)})`)
  }
}

/**
 * Monte le popup dans une page, avec un `chrome` de complaisance.
 *
 * `runScripts: 'dangerously'` puis injection par balise : `window.eval` de
 * jsdom évalue hors du contexte de la fenêtre, et le script y trouverait
 * `window` indéfini — un échec qui n'existe pas dans Chrome.
 */
async function ouvrirPopup({ jeton = null, urlOnglet = 'https://fr.aliexpress.com/item/1.html', sitesApprouves = [] } = {}) {
  const dom = new JSDOM(lire('popup.html'), { runScripts: 'dangerously', url: 'https://popup.test/' })
  const w = dom.window

  const stockage = { token: jeton, approvedSites: sitesApprouves, apiBase: 'https://api.test', appUrl: 'https://www.drop-shipper.fr' }

  const ouverts = []
  w.chrome = {
    storage: {
      local: {
        async get(cle) {
          const cles = typeof cle === 'string' ? [cle] : Array.isArray(cle) ? cle : Object.keys(cle ?? {})
          const sortie = {}
          for (const c of cles) if (stockage[c] !== undefined && stockage[c] !== null) sortie[c] = stockage[c]
          return sortie
        },
        async set(o) {
          Object.assign(stockage, o)
        },
        async remove(c) {
          delete stockage[c]
        },
      },
    },
    tabs: {
      async query() {
        return urlOnglet ? [{ id: 1, url: urlOnglet }] : []
      },
      create: (o) => ouverts.push(o.url),
      reload() {},
    },
    permissions: { async request() { return true }, async remove() { return true } },
    sidePanel: { async open() {} },
    runtime: { sendMessage() {}, lastError: null },
  }
  // Le popup n'appelle le réseau que pour l'adresse de l'application : on la
  // lui donne d'avance dans le stockage, et tout appel restant échoue en silence.
  w.fetch = async () => ({ ok: false, json: async () => ({}) })

  /*
   * Les scripts vont dans `<head>`, et jamais dans `<body>`.
   *
   * Posés dans le corps, leur source **fait partie** de `body.textContent` : le
   * banc lisait alors le code de `popup.js` en même temps que l'écran, et une
   * phrase écrite dans un commentaire suffisait à faire passer une attente.
   * C'est arrivé — « l'encadré du site est quand même là » passait sur
   * l'ancienne version, qui justement ne l'affichait pas.
   */
  for (const f of ['config.js', 'popup.js']) {
    const script = w.document.createElement('script')
    script.textContent = lire(f)
    w.document.head.appendChild(script)
  }

  // Les rendus sont asynchrones (stockage, onglet actif) : on laisse tourner.
  await new Promise((r) => setTimeout(r, 60))
  // Et on ne lit que ce que le popup a écrit, pas la page qui l'entoure.
  return {
    w,
    texte: () => (w.document.getElementById('app')?.textContent ?? '').replace(/\s+/g, ' '),
    ouverts,
  }
}

;(async () => {
  // --- Déconnecté : l'écran de connexion --------------------------------------
  console.log("\nDéconnecté — l'écran de connexion")
  {
    const { w, texte } = await ouvrirPopup({ jeton: null })
    const t = texte()

    verifier('un vrai formulaire, pour que le gestionnaire de mots de passe propose de retenir', !!w.document.querySelector('form'))
    verifier(
      "le champ d'adresse se laisse compléter par Chrome",
      w.document.querySelector('#email')?.getAttribute('autocomplete') === 'username',
    )
    verifier(
      'le mot de passe aussi',
      w.document.querySelector('#password')?.getAttribute('autocomplete') === 'current-password',
    )
    verifier('un œil pour relire son mot de passe', !!w.document.querySelector('#voirMdp'))
    verifier('on peut retrouver un mot de passe oublié', /mot de passe oublié/i.test(t))
    verifier('on sait que le compte est celui du site', /drop-shipper\.fr/i.test(t))
    verifier('on peut aller se connecter sur le site', /se connecter/i.test(t) && !!w.document.querySelector('#ouvrirSite'))
    verifier('on peut créer un compte', !!w.document.querySelector('#creerCompte'))
  }

  // --- L'œil découvre puis remasque -------------------------------------------
  console.log("\nL'œil du mot de passe")
  {
    const { w } = await ouvrirPopup({ jeton: null })
    const champ = w.document.querySelector('#password')
    const oeil = w.document.querySelector('#voirMdp')
    verifierSansLever('masqué au départ', () => champ.type === 'password')
    verifierSansLever('découvert au clic', () => {
      oeil.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
      return champ.type === 'text'
    })
    verifierSansLever('remasqué au second clic', () => {
      oeil.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
      return champ.type === 'password'
    })
  }

  // --- Les liens mènent où ils disent ------------------------------------------
  console.log('\nLes liens de secours')
  {
    const { w, ouverts } = await ouvrirPopup({ jeton: null })
    for (const [id, attendu] of [
      ['mdpOublie', '/forgot-password'],
      ['ouvrirSite', '/login'],
      ['creerCompte', '/register'],
    ]) {
      try {
        w.document.querySelector(`#${id}`).dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
      } catch {
        // Bouton absent : l'attente échoue ci-dessous, le banc continue.
      }
      await new Promise((r) => setTimeout(r, 20))
      verifier(`« ${id} » ouvre ${attendu}`, ouverts.some((u) => u.endsWith(attendu)), ouverts.at(-1) ?? 'rien')
    }
  }

  // --- Connecté, sur une page marchande ----------------------------------------
  console.log("\nConnecté, sur une fiche produit")
  {
    const { texte } = await ouvrirPopup({ jeton: 'x'.repeat(40) })
    const t = texte()
    verifier('le bouton du site est proposé', /ajouter le bouton/i.test(t))
    verifier('le site concerné est nommé', /aliexpress/i.test(t))
    verifier('le panneau des annonces reste accessible', /panneau des annonces/i.test(t))
    /*
     * L'import groupé se trouve depuis l'icône, pas seulement dans le panneau.
     *
     * Signalé le 02/09/2026 : « aucun bouton créer une liste ». Il existait —
     * dans le panneau latéral, que l'on n'ouvre pas par réflexe. Une fonction
     * qu'on ne trouve pas n'existe pas, et aucun banc ne le voyait puisqu'ils
     * éprouvaient chacun leur écran.
     */
    verifier("l'import groupé est proposé dès le popup", /liste d'import group/i.test(t))
  }

  // --- Connecté, mais sur une page interne de Chrome ---------------------------
  /*
   * C'est la panne du 02/09/2026, et c'est le cas le plus probable : après un
   * rechargement de l'extension, l'onglet actif est chrome://extensions. Le
   * vendeur ouvrait le popup pour ajouter le bouton, et l'option avait
   * simplement disparu — sans une ligne pour dire pourquoi.
   */
  console.log("\nConnecté, sur une page interne de Chrome")
  {
    const { texte } = await ouvrirPopup({ jeton: 'x'.repeat(40), urlOnglet: 'chrome://extensions/' })
    const t = texte()
    verifier("l'encadré du site est quand même là", /ajouter le bouton/i.test(t))
    verifier('et il explique pourquoi ce n’est pas possible ici', /page interne de chrome/i.test(t))
    verifier('et il dit quoi faire', /ouvrez la fiche/i.test(t))
  }

  // --- Connecté, sur un site déjà autorisé --------------------------------------
  console.log('\nConnecté, sur un site déjà autorisé')
  {
    const { texte } = await ouvrirPopup({
      jeton: 'x'.repeat(40),
      sitesApprouves: ['https://fr.aliexpress.com'],
    })
    const t = texte()
    verifier('le popup dit que le bouton est actif', /bouton actif/i.test(t))
    verifier('et où le trouver', /en bas à droite/i.test(t))
  }

  console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
  process.exit(echecs ? 1 : 0)
})()
