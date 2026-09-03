/**
 * Les produits recommandés ne sont pas le produit.
 *
 *   cd backend && node check-recommandations.cjs
 *
 * **La panne du 03/09/2026, sur une vraie annonce du catalogue.** Une bague
 * maçonnique importée depuis Temu portait quinze photos : en première un
 * pendentif boussole, en neuvième un sac besace kaki « Tokyo Japan ». Vingt-six
 * annonces du même lot dans le même état — « les photos c'est un carnage ».
 *
 * Aucun filtre existant ne pouvait les écarter, et ce n'était pas un oubli :
 * sur Temu, la vignette de recommandation sort du **même CDN** que la galerie
 * (`img.kwcdn.com`), sous le **même chemin** (`/product/`), dans une **vraie
 * balise `<img>`**, et souvent **plus grande** que les photos du produit. Les
 * quatre signaux du tri disaient tous « photo de produit », et ils avaient
 * raison : c'en est une, mais d'un autre produit.
 *
 * L'adaptateur Temu les *certifiait* donc — et ce qu'un adaptateur désigne
 * passe devant tout le reste, précisément parce qu'on le croit sur parole.
 *
 * Le seul signal qui les sépare est structurel : **une vignette de
 * recommandation est cliquable vers une autre fiche**, c'est sa raison d'être ;
 * une photo de galerie ne l'est jamais. Ce banc monte une page bâtie comme
 * celle de Temu — même hôte, même chemin, recommandations plus grandes que la
 * galerie — et vérifie que la règle tient dans les deux sens : elle écarte le
 * carrousel, et elle ne touche ni au zoom ni au sélecteur de variante, qui sont
 * eux aussi des liens autour d'une image.
 */
const { JSDOM } = require('jsdom')
const fs = require('fs')
const path = require('path')

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const CDN = 'https://img.kwcdn.com/product/fancy'
const FICHE = 'https://www.temu.com/fr/bague-equerre-g-606271004607882.html'

/** Une page Temu : galerie, zoom, variantes, et le carrousel « vous aimerez aussi ». */
function pageTemu() {
  const galerie = [1, 2, 3, 4, 5, 6]
    .map(
      (n) =>
        // Le zoom : un lien autour d'une photo de galerie, vers le fichier image.
        `<a href="${CDN}/bague-${n}.jpg"><img src="${CDN}/bague-${n}.jpg" width="800" height="800"></a>`,
    )
    .join('')

  // Le choix de variante : un lien vers la même fiche, avec d'autres paramètres.
  const variantes = ['or', 'argent']
    .map(
      (c) =>
        `<a href="/fr/bague-equerre-g-606271004607882.html?sku=${c}"><img src="${CDN}/bague-sku-${c}.jpg" width="600" height="600"></a>`,
    )
    .join('')

  /*
   * Les recommandations : mêmes hôte et chemin que la galerie, et **plus
   * grandes** qu'elle. C'est le cas réel — sur la fiche de la bague, le
   * pendentif boussole et le sac kaki étaient servis en 1200 px.
   */
  const recommandations = Array.from({ length: 20 }, (_, i) => i + 1)
    .map(
      (n) =>
        `<a href="/fr/autre-produit-${n}-g-9999${n}.html"><img src="${CDN}/voisin-${n}.jpg" width="1200" height="1200"></a>`,
    )
    .join('')

  /*
   * Le panier permanent, colle a droite de l ecran.
   *
   * Signale le 03/09/2026 : « il trouve cette photo recurrente car elle est
   * dans mon panier Temu affiche constamment a droite, c est la premiere de la
   * liste — collier boussole ». Ce n est pas une recommandation : c est un
   * panneau flottant, present sur toutes les fiches du site, donc dans tous les
   * imports. La photo d un article en panier est une vraie photo de produit,
   * sur le bon CDN, sous le bon chemin, a la bonne taille : rien d autre que sa
   * position ne la trahit.
   *
   * Sans lien autour d elle, volontairement — la regle du lien ne l attrape
   * pas, c est tout l objet de ce cas.
   */
  const panier = `<div id="panier" style="position: fixed; right: 0; top: 0">
    <img src="${CDN}/collier-boussole.jpg" width="800" height="800">
    <img src="${CDN}/panier-2.jpg" width="800" height="800">
  </div>`

  // Une barre d achat collee en bas : `sticky`, et elle doit rester toleree —
  // plusieurs marchands rendent la colonne de la galerie collante.
  const collante = `<div id="collante" style="position: sticky; bottom: 0">
    <img src="${CDN}/bague-collante.jpg" width="800" height="800">
  </div>`

  return `<!doctype html><html><head></head><body>
    <div id="galerie">${galerie}</div>
    <div id="variantes">${variantes}</div>
    <div id="recommandations">${recommandations}</div>
    ${panier}
    ${collante}
  </body></html>`
}

/** Charge image-scan.js et adapters.js dans une page, comme le fait Chrome. */
function monter(html, url) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url })
  const w = dom.window

  // `background.js` les injecte dans cet ordre : image-scan avant adapters,
  // parce que le second se sert de la règle définie par le premier.
  for (const fichier of ['image-scan.js', 'adapters.js']) {
    const code = fs.readFileSync(path.join(__dirname, 'extension', 'content', fichier), 'utf8')
    const script = dom.window.document.createElement('script')
    script.textContent = code
    dom.window.document.head.appendChild(script)
  }

  return w
}

// --- La galerie et le voisinage sont bien séparés ----------------------------
console.log('\nUne fiche Temu, galerie et recommandations sur le même CDN')
{
  const w = monter(pageTemu(), FICHE)

  verifier(
    "l'adaptateur Temu est bien celui qui est choisi",
    w.dspAdapterFor()?.key === 'temu',
    w.dspAdapterFor()?.label ?? 'aucun',
  )

  const retenues = w.dspAdapterImages(w.dspAdapterFor())
  const voisins = retenues.filter((u) => u.includes('/voisin-'))
  const bagues = retenues.filter((u) => u.includes('/bague-'))

  /*
   * Le cœur du banc. Avant la correction : vingt-huit adresses retenues, dont
   * les vingt du carrousel — et comme elles étaient les plus grandes, elles
   * passaient en tête.
   */
  verifier(
    'aucune photo du carrousel de recommandations',
    voisins.length === 0,
    `${voisins.length} voisin(s) sur ${retenues.length} retenue(s)`,
  )
  verifier(
    'les six photos de la galerie sont conservées',
    bagues.filter((u) => /bague-\d\.jpg/.test(u)).length === 6,
    `${bagues.length} adresse(s) de la fiche`,
  )
  verifier(
    'le choix de variante reste une photo du produit',
    retenues.some((u) => u.includes('bague-sku-')),
    'un lien vers la même fiche avec ?sku= ne sort pas la photo',
  )

  /*
   * Le cas signalé par le vendeur, et le plus coûteux des deux : le panier
   * flottant est sur TOUTES les fiches, donc il polluait TOUS les imports —
   * alors qu'une recommandation change d'une fiche à l'autre.
   */
  verifier(
    'le panier flottant est écarté',
    !retenues.some((u) => u.includes('collier-boussole') || u.includes('panier-2')),
    retenues.filter((u) => /collier-boussole|panier-2/.test(u)).length + ' photo(s) de panier retenue(s)',
  )
  verifier(
    "une colonne « sticky » n'est pas confondue avec un panneau flottant",
    retenues.some((u) => u.includes('bague-collante')),
    'la galerie de plusieurs marchands est collante pendant la lecture',
  )
}

// --- La règle elle-même, cas par cas -----------------------------------------
console.log('\nLa règle du lien, cas par cas')
{
  const w = monter(pageTemu(), FICHE)
  const d = w.document
  const seul = (sel) => d.querySelector(sel)

  verifier(
    'une photo de galerie liée à son propre fichier reste dedans',
    w.dspPointeVersUneAutreFiche(seul('#galerie img')) === false,
    'lien vers le .jpg : une loupe, pas un voisin',
  )
  verifier(
    'un lien vers la même fiche avec ?sku= reste dedans',
    w.dspPointeVersUneAutreFiche(seul('#variantes img')) === false,
  )
  verifier(
    'un lien vers une autre fiche du même site est ailleurs',
    w.dspPointeVersUneAutreFiche(seul('#recommandations img')) === true,
  )

  // Une image sans aucun lien autour d'elle : le cas le plus courant.
  d.body.insertAdjacentHTML('beforeend', `<img id="nue" src="${CDN}/bague-nue.jpg">`)
  verifier('une image sans lien reste dedans', w.dspPointeVersUneAutreFiche(seul('#nue')) === false)

  // Une ancre interne et un lien javascript: ne mènent nulle part.
  d.body.insertAdjacentHTML('beforeend', `<a href="#zoom"><img id="ancre" src="${CDN}/bague-ancre.jpg"></a>`)
  verifier('une ancre interne reste dedans', w.dspPointeVersUneAutreFiche(seul('#ancre')) === false)

  // Un lien sortant : bannière partenaire, publicité, réseau social.
  d.body.insertAdjacentHTML(
    'beforeend',
    `<a href="https://ailleurs.example/promo"><img id="sortant" src="${CDN}/banniere.jpg"></a>`,
  )
  verifier('un lien vers un autre domaine est ailleurs', w.dspPointeVersUneAutreFiche(seul('#sortant')) === true)
}

// --- Le relevé rend la liste du voisinage au tri ------------------------------
/*
 * `dspScanPageImages` est asynchrone — il attend les images différées.
 *
 * Appelé sans `await`, il rend une promesse : `scan.length` valait `undefined`
 * et `dspScanMeta` n'était pas encore posé, donc ce banc accusait un code juste.
 * Troisième fois qu'un banc de ce projet se trompe de cible ; il vaut mieux
 * qu'il le dise ici que de le découvrir en production.
 */
async function verifierLeScan() {
  console.log('\nCe que le scan transmet au tri')
  const w = monter(pageTemu(), FICHE)
  // `dspScanPageImages` remplit `dspScanMeta` en même temps qu'il ratisse.
  const scan = await w.dspScanPageImages()
  const meta = w.dspScanMeta ?? {}
  const voisinage = meta.voisinage ?? []

  verifier(
    'le scan désigne le voisinage à part',
    voisinage.filter((u) => u.includes('/voisin-')).length === 20,
    `${voisinage.length} adresse(s) désignée(s)`,
  )
  verifier(
    'et il ne range pas la galerie dedans',
    voisinage.every((u) => !/bague-\d\.jpg/.test(u)),
  )
  verifier('le scan trouve tout de même toutes les images', scan.length >= 26, `${scan.length} adresse(s)`)

  /*
   * Le panier passe par le mobilier, pas par le voisinage : ce sont deux
   * populations distinctes, et les confondre ferait disparaître la distinction
   * le jour où l'une des deux règles doit changer.
   */
  const mobilier = meta.mobilier ?? []
  verifier(
    'le panier flottant est rangé dans le mobilier',
    mobilier.some((u) => u.includes('collier-boussole')),
    `${mobilier.length} élément(s) de mobilier`,
  )
  verifier(
    'et la galerie n’y est pas',
    mobilier.every((u) => !/bague-\d\.jpg/.test(u)),
  )
}

// --- Le tri générique les écarte aussi ---------------------------------------
function verifierLeTri() {
  console.log("\nLe tri de capture.js s'en sert")
  const source = fs.readFileSync(path.join(__dirname, 'extension', 'content', 'capture.js'), 'utf8')
  verifier('capture.js lit le voisinage', /meta\.voisinage/.test(source))
  verifier(
    'et le pénalise comme le mobilier',
    /if \(voisinage\.has\(identite\)\) value -= 4000/.test(source),
  )

  const adapters = fs.readFileSync(path.join(__dirname, 'extension', 'content', 'adapters.js'), 'utf8')
  verifier(
    "l'adaptateur applique les deux règles avant de retenir une image",
    /dspHorsFiche\(img\)/.test(adapters),
  )
}

verifierLeScan()
  .then(verifierLeTri)
  .then(() => {
    console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
    process.exit(echecs ? 1 : 0)
  })
