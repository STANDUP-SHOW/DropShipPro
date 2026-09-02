/**
 * La liste d'import groupé du panneau latéral.
 *
 *   cd backend && node check-lot.cjs
 *
 * **Ce que ce banc protège.** C'est la seule voie possible pour importer
 * plusieurs fiches AliExpress : le serveur n'y verra jamais de prix, donc
 * chaque page doit être lue dans le navigateur pendant qu'elle est affichée.
 * Si cette liste se casse, il n'y a pas de repli.
 *
 * Il charge le fichier livré avec un faux `chrome` et un faux `apiFetch`, et
 * vérifie les gestes du vendeur : ajouter, refuser un doublon, plier une
 * vignette, retirer, importer, et ce qui reste après un échec.
 *
 * L'avertissement sur la marge automatique est vérifié comme le reste : c'est
 * une promesse faite au vendeur avant qu'il clique, pas une décoration.
 */
const { JSDOM } = require('jsdom')
const fs = require('fs')
const path = require('path')

const SOURCE = path.join(__dirname, 'extension', 'lot.js')

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

/** Une fiche relevée, telle que `releverPourLot` la rend. */
function fiche(n) {
  return {
    sourceUrl: `https://fr.aliexpress.com/item/100${n}.html`,
    title: `Souris Bluetooth ergonomique ${n}`,
    price: 12.5 + n,
    currency: 'EUR',
    images: [`https://ae01.alicdn.com/kf/souris-${n}-1.jpg`, `https://ae01.alicdn.com/kf/souris-${n}-2.jpg`],
    variants: { Couleur: ['Noir', 'Blanc'] },
  }
}

/** Monte le panneau avec un faux navigateur, et rend de quoi le piloter. */
function monterPanneau({ urlOnglet = 'https://fr.aliexpress.com/item/1001.html', releve = fiche(1), imports = [] } = {}) {
  const dom = new JSDOM('<div id="app"></div>', { runScripts: 'dangerously', url: 'https://panneau.test/' })
  const w = dom.window
  const stockage = {}

  w.chrome = {
    storage: {
      local: {
        async get(cle) {
          const cles = typeof cle === 'string' ? [cle] : Object.keys(cle ?? {})
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
    },
    tabs: { async query() { return [{ id: 7, url: urlOnglet }] } },
    runtime: {
      async sendMessage(m) {
        if (m.type === 'dsp-relever-onglet') {
          return releve ? { ok: true, payload: releve } : { ok: false, error: 'Fiche non reconnue' }
        }
        return { ok: false }
      },
    },
  }

  // Le faux appel d'API : il note ce qui part, et peut refuser sur commande.
  /*
   * `body` est un objet, pas du texte JSON.
   *
   * Première version de ce faux : `JSON.parse(options.body)`. Il levait avant
   * même d'enregistrer l'appel, et le banc rapportait « 0 requête » sur un
   * volet qui en envoyait trois — cinq échecs imaginaires, et une heure perdue
   * à chercher dans le bon fichier une panne qui était dans le mien.
   *
   * Le vrai `apiFetch` (voir `extension/config.js`) passe l'objet tel quel au
   * service worker, qui le sérialise. Un faux qui ne respecte pas le contrat de
   * ce qu'il remplace n'éprouve rien : il invente une panne.
   */
  w.apiFetch = async (chemin, options) => {
    const corps = typeof options.body === 'string' ? JSON.parse(options.body) : options.body
    imports.push({ chemin, titre: corps.title })
    if (corps.title.includes('REFUS')) throw new Error('Crédits épuisés')
    return { id: `p${imports.length}` }
  }

  const script = w.document.createElement('script')
  script.textContent = fs.readFileSync(SOURCE, 'utf8')
  w.document.head.appendChild(script)

  return { w, hote: w.document.getElementById('app'), stockage, imports }
}

const attendre = (ms = 30) => new Promise((r) => setTimeout(r, ms))
const cliquer = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))

;(async () => {
  // --- Une liste vide -------------------------------------------------------
  console.log('\nÀ l’ouverture')
  {
    const { w, hote } = monterPanneau()
    await w.montrerLot(hote, () => {})
    await attendre()
    verifier('la liste est annoncée vide', /liste est vide/i.test(hote.textContent))
    verifier('le compteur part de zéro sur vingt-cinq', /0 \/ 25/.test(hote.textContent))
    verifier("le bouton d'import n'existe pas encore", !hote.querySelector('#lot-importer'))
    verifier("l'avertissement n'est pas affiché pour rien", !/marge automatique/i.test(hote.textContent))
  }

  // --- Ajouter un produit ---------------------------------------------------
  console.log('\nAjouter le produit de l’onglet')
  {
    const { w, hote, stockage } = monterPanneau()
    await w.montrerLot(hote, () => {})
    await attendre()
    cliquer(w, hote.querySelector('#lot-ajouter'))
    await attendre(60)

    verifier('le produit apparaît dans la liste', /Souris Bluetooth ergonomique 1/.test(hote.textContent))
    verifier('avec son prix', /13[.,]5/.test(hote.textContent))
    verifier('le compteur suit', /1 \/ 25/.test(hote.textContent))
    verifier('la liste survit à la fermeture du panneau', (stockage.listeImport ?? []).length === 1)
    /*
     * La charge complète est gardée, pas seulement l'adresse.
     *
     * C'est tout l'intérêt : la page ne sera plus relue. Ne stocker que
     * l'adresse ferait une liste de vingt-cinq fiches inimportables, puisque
     * le serveur ne peut pas lire une page AliExpress.
     */
    verifier(
      'la fiche relevée est gardée entière',
      !!stockage.listeImport?.[0]?.payload?.images?.length,
      `${stockage.listeImport?.[0]?.payload?.images?.length ?? 0} photo(s)`,
    )
  }

  // --- L'avertissement ------------------------------------------------------
  console.log('\nCe qui est dit avant d’importer')
  {
    const { w, hote } = monterPanneau()
    await w.montrerLot(hote, () => {})
    await attendre()
    cliquer(w, hote.querySelector('#lot-ajouter'))
    await attendre(60)
    const t = hote.textContent
    verifier('les annonces partent directement dans la liste', /directement dans votre liste d'annonces/i.test(t))
    verifier('la marge automatique est annoncée', /marge automatique/i.test(t))
    verifier('les prix de revente sont à contrôler', /prix\s+de\s+revente/i.test(t))
    verifier('les photos aussi', /photos sont prises/i.test(t))
  }

  // --- Le doublon -----------------------------------------------------------
  console.log('\nLe même produit deux fois')
  {
    const { w, hote, stockage } = monterPanneau()
    await w.montrerLot(hote, () => {})
    await attendre()
    cliquer(w, hote.querySelector('#lot-ajouter'))
    await attendre(60)
    cliquer(w, hote.querySelector('#lot-ajouter'))
    await attendre(60)
    verifier('il n’est ajouté qu’une fois', (stockage.listeImport ?? []).length === 1)
    verifier('et on le dit', /déjà dans la liste/i.test(hote.textContent))
  }

  // --- Une page qui n'est pas une fiche -------------------------------------
  console.log('\nUn onglet sans fiche produit')
  {
    const { w, hote, stockage } = monterPanneau({ releve: null })
    await w.montrerLot(hote, () => {})
    await attendre()
    cliquer(w, hote.querySelector('#lot-ajouter'))
    await attendre(60)
    verifier('rien n’est ajouté', (stockage.listeImport ?? []).length === 0)
    verifier('la raison est affichée', /non reconnue/i.test(hote.textContent))
  }

  // --- Plier et retirer -----------------------------------------------------
  console.log('\nLa vignette dépliable')
  {
    const { w, hote, stockage } = monterPanneau()
    await w.montrerLot(hote, () => {})
    await attendre()
    cliquer(w, hote.querySelector('#lot-ajouter'))
    await attendre(60)

    const detail = hote.querySelector('.lot-detail')
    verifier('repliée au départ', detail.style.display === 'none')
    cliquer(w, hote.querySelector('.lot-plier'))
    verifier('dépliée au clic', detail.style.display === 'block')
    verifier('elle montre les photos', hote.querySelectorAll('.lot-detail img').length === 2)

    cliquer(w, hote.querySelector('.lot-retirer'))
    await attendre(60)
    verifier('le retrait vide la liste', (stockage.listeImport ?? []).length === 0)
  }

  // --- L'import -------------------------------------------------------------
  console.log("\nL'import du lot")
  {
    const imports = []
    const { w, hote, stockage } = monterPanneau({ imports })
    // Trois fiches posées d'avance, dont une qui échouera.
    stockage.listeImport = [1, 2, 3].map((n) => {
      const f = fiche(n)
      if (n === 2) f.title = 'REFUS ' + f.title
      return { url: f.sourceUrl, titre: f.title, prix: f.price, devise: 'EUR', images: f.images, payload: f }
    })

    await w.montrerLot(hote, () => {})
    await attendre()
    cliquer(w, hote.querySelector('#lot-importer'))
    await attendre(200)

    /*
     * Une requête par produit, jamais un seul appel pour tout le lot.
     *
     * Vingt-cinq imports dans une requête dépassent tous les délais de proxy :
     * la connexion tombe pendant que le serveur continue. C'est la panne
     * corrigée côté site le 02/09/2026, et rien ne justifie de la refaire ici.
     */
    verifier('une requête par produit', imports.length === 3, `${imports.length} appel(s)`)
    verifier(
      'toutes vers la capture',
      imports.every((i) => i.chemin === '/api/products/capture'),
    )
    verifier('le compte rendu dit combien sont passés', /2 importé/i.test(hote.textContent))
    verifier("et pourquoi l'autre a échoué", /Crédits épuisés/i.test(hote.textContent))
    /*
     * Seuls les échecs restent.
     *
     * Relancer un lot où les réussites sont encore présentes les importerait
     * une seconde fois : le vendeur se retrouverait avec des doublons dans son
     * catalogue, sans comprendre d'où ils viennent.
     */
    verifier('seul l’échec reste dans la liste', (stockage.listeImport ?? []).length === 1)
    verifier(
      'et c’est bien celui qui a échoué',
      (stockage.listeImport ?? [])[0]?.titre?.startsWith('REFUS'),
    )
  }

  console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
  process.exit(echecs ? 1 : 0)
})()
